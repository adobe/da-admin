/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import { auditDirPrefix, auditEntryKey } from './paths.js';

/** Same-user edits within this window (ms) collapse into one entry (last timestamp). 30 min. */
export const AUDIT_TIME_WINDOW_MS = 30 * 60 * 1000;

const SEP = '\t';

/**
 * Serialize one audit entry to a line (timestamp \t users \t path \t versionLabel \t versionId).
 * versionLabel = human-readable name (e.g. "Restore Point"); versionId = snapshot filename.
 * Both empty for edits.
 * @param {object} entry - { timestamp, users, path, versionLabel?, versionId? }
 * @returns {string}
 */
export function formatAuditLine(entry) {
  const versionLabel = entry.versionLabel ?? '';
  const versionId = entry.versionId ?? '';
  return [entry.timestamp, entry.users, entry.path, versionLabel, versionId].join(SEP);
}

/**
 * Parse one audit line to { timestamp, users, path, versionLabel, versionId }.
 * Backward compat: 5 cols (label+id), 4 cols (id only), 3 cols (path only).
 * @param {string} line
 * @returns {object|null} { timestamp, users, path, versionLabel, versionId }
 */
export function parseAuditLine(line) {
  const t = line.trim();
  if (!t) return null;
  const parts = t.split(SEP);
  if (parts.length < 3) return null;
  let versionLabel = '';
  let versionId = '';
  if (parts.length >= 5) {
    versionId = parts.pop();
    versionLabel = parts.pop();
  } else if (parts.length >= 4) {
    versionId = parts.pop();
  }
  const path = parts.slice(2).join(SEP);
  return {
    timestamp: parts[0],
    users: parts[1],
    path,
    versionLabel,
    versionId,
  };
}

/**
 * Read audit body stream to string. Handles Web ReadableStream (Workers/R2),
 * fetch Response.body, and Node-style async iterable streams.
 * @param {ReadableStream|import("stream").Readable|string} body
 * @returns {Promise<string>}
 */
async function streamToString(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (typeof body.text === 'function') {
    const text = await body.text();
    return text;
  }
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks = [];
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- stream read must be sequential
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      if (chunks.length === 0) return '';
      const blob = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
      let off = 0;
      for (const c of chunks) {
        blob.set(c, off);
        off += c.length;
      }
      return new TextDecoder().decode(blob);
    } finally {
      reader.releaseLock?.();
    }
  }
  const chunks = [];
  try {
    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
        ? chunk
        : Buffer.from(String(chunk));
      chunks.push(buf);
    }
  } catch {
    return '';
  }
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
}

/**
 * Normalize users for same-user comparison (stable string).
 * @param {string} usersJson
 * @returns {string}
 */
function usersNormalized(usersJson) {
  try {
    const arr = JSON.parse(usersJson);
    const emails = Array.isArray(arr) ? arr.map((u) => u?.email ?? '').filter(Boolean) : [];
    return emails.join(',') || usersJson;
  } catch {
    return usersJson;
  }
}

/**
 * Collapse consecutive same-user edit entries within AUDIT_TIME_WINDOW_MS into the later entry.
 * Matches the historical write-side collapse: same user, both edits (no versionLabel/versionId),
 * within 30 minutes => keep only the later entry. Version entries always break the window.
 * @param {object[]} entries - ascending by timestamp; each carries usersRaw for collapse
 * @returns {object[]}
 */
function collapseAuditEntries(entries) {
  const out = [];
  for (const entry of entries) {
    const last = out.length ? out[out.length - 1] : null;
    const isVersion = !!(entry.versionLabel || entry.versionId);
    const lastIsVersion = last && !!(last.versionLabel || last.versionId);
    const canCollapse = last
      && !isVersion
      && !lastIsVersion
      && usersNormalized(last.usersRaw) === usersNormalized(entry.usersRaw)
      && (entry.timestamp - last.timestamp) <= AUDIT_TIME_WINDOW_MS;
    if (canCollapse) {
      out[out.length - 1] = entry;
    } else {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Read all audit entries for a file. Merges legacy audit.txt + audit-{ts}.txt archives + per-entry
 * objects under {org}/{repo}/.da-versions/{fileId}/audit/. Entries are sorted ascending by
 * timestamp with the same-user same-window collapse applied (formerly enforced write-side).
 * @param {object} env
 * @param {{ bucket: string, org: string }} ctx
 * @param {string} repo
 * @param {string} fileId
 * @returns {Promise<object[]>} entries with { timestamp, users, path, versionLabel?, versionId? }
 */
export async function readAuditLines(env, ctx, repo, fileId) {
  const config = getS3Config(env);
  const client = new S3Client(config);
  const prefix = `${ctx.org}/${auditDirPrefix(repo, fileId)}`;

  let keys = [];
  try {
    let continuationToken;
    do {
      // eslint-disable-next-line no-await-in-loop
      const listResp = await client.send(new ListObjectsV2Command({
        Bucket: ctx.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      const page = (listResp.Contents || []).map((obj) => obj.Key);
      keys = keys.concat(page);
      continuationToken = listResp.IsTruncated ? listResp.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NoSuchKey') {
      return [];
    }
    throw e;
  }

  if (keys.length === 0) return [];

  const allLineArrays = await Promise.all(keys.map(async (key) => {
    try {
      const resp = await client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: key }));
      const text = await streamToString(resp.Body);
      return text.split('\n').map(parseAuditLine).filter(Boolean);
    } catch {
      return [];
    }
  }));

  const parsed = allLineArrays.flat().map((line) => ({
    timestamp: parseInt(line.timestamp, 10) || 0,
    usersRaw: line.users,
    users: (() => {
      try {
        return JSON.parse(line.users);
      } catch {
        return [{ email: 'anonymous' }];
      }
    })(),
    path: line.path,
    versionLabel: line.versionLabel || undefined,
    versionId: line.versionId || undefined,
  }));

  parsed.sort((a, b) => a.timestamp - b.timestamp);

  return collapseAuditEntries(parsed).map(({ usersRaw: _, ...rest }) => rest);
}

/**
 * Append one audit entry as a fresh per-entry object under the audit/ prefix. Append-only:
 * no GET, no etag, no retry — one unconditional PUT per call eliminates the read-modify-write
 * contention that the previous read-modify-write-with-If-Match path exhibited under load.
 * @param {object} env
 * @param {{ bucket: string, org: string }} ctx - bucket, org
 * @param {string} repo
 * @param {string} fileId
 * @param {object} entry - { timestamp, users, path, versionLabel?, versionId? }
 * @returns {Promise<{ status: number, error?: string }>}
 */
export async function writeAuditEntry(env, ctx, repo, fileId, entry) {
  try {
    const config = getS3Config(env);
    const client = new S3Client(config);
    const ts = parseInt(entry.timestamp, 10) || Date.now();
    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const key = `${ctx.org}/${auditEntryKey(repo, fileId, ts, rand)}`;
    const body = `${formatAuditLine({ ...entry, timestamp: String(ts) })}\n`;
    const resp = await client.send(new PutObjectCommand({
      Bucket: ctx.bucket,
      Key: key,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    }));
    return { status: resp?.$metadata?.httpStatusCode ?? 200 };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('writeAuditEntry failed', e);
    return { status: 500, error: e.message };
  }
}
