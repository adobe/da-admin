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
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import { auditKey } from './paths.js';

/** Same-user edits within this window (ms) collapse into one entry (last timestamp). 30 min. */
export const AUDIT_TIME_WINDOW_MS = 30 * 60 * 1000;

const SEP = '\t';

/**
 * Serialize one audit entry to a line (timestamp \t users \t path).
 * @param {{ timestamp: string, users: string, path: string }} entry
 * @returns {string}
 */
export function formatAuditLine(entry) {
  return [entry.timestamp, entry.users, entry.path].join(SEP);
}

/**
 * Parse one audit line to { timestamp, users, path }.
 * @param {string} line
 * @returns {{ timestamp: string, users: string, path: string }|null}
 */
export function parseAuditLine(line) {
  const t = line.trim();
  if (!t) return null;
  const parts = t.split(SEP);
  if (parts.length < 3) return null;
  return {
    timestamp: parts[0],
    users: parts[1],
    path: parts.slice(2).join(SEP),
  };
}

/**
 * Read audit.txt body stream to string.
 * @param {import('stream').Readable|ReadableStream|string} body
 * @returns {Promise<string>}
 */
async function streamToString(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (typeof body.text === 'function') {
    const text = await body.text();
    return text;
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
 * Read all audit lines for a file (new structure).
 * @param {object} env
 * @param {{ bucket: string, org: string }} ctx - bucket, org
 * @param {string} repo
 * @param {string} fileId
 * @returns {Promise<{ timestamp: number, users: object[], path: string }[]>}
 */
export async function readAuditLines(env, ctx, repo, fileId) {
  const config = getS3Config(env);
  const client = new S3Client(config);
  const key = `${ctx.org}/${auditKey(repo, fileId)}`;
  try {
    const resp = await client.send(new GetObjectCommand({
      Bucket: ctx.bucket,
      Key: key,
    }));
    const text = await streamToString(resp.Body);
    const lines = text.split('\n').map(parseAuditLine).filter(Boolean);
    return lines.map((line) => ({
      timestamp: parseInt(line.timestamp, 10) || 0,
      users: (() => {
        try {
          return JSON.parse(line.users);
        } catch {
          return [{ email: 'anonymous' }];
        }
      })(),
      path: line.path,
    }));
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NoSuchKey') {
      return [];
    }
    throw e;
  }
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
 * Append or update last line in audit.txt (read-modify-write). If last line is same user
 * and within AUDIT_TIME_WINDOW_MS, replace that line with the new timestamp; else append.
 * @param {object} env
 * @param {{ bucket: string, org: string }} ctx - bucket, org
 * @param {string} repo
 * @param {string} fileId
 * @param {{ timestamp: string, users: string, path: string }} entry
 * @returns {Promise<{ status: number }>}
 */
export async function writeAuditEntry(env, ctx, repo, fileId, entry) {
  try {
    const config = getS3Config(env);
    const client = new S3Client(config);
    const key = `${ctx.org}/${auditKey(repo, fileId)}`;
    const nowMs = parseInt(entry.timestamp, 10) || Date.now();
    const entryUsersNorm = usersNormalized(entry.users);

    let existingText = '';
    try {
      const getResp = await client.send(new GetObjectCommand({
        Bucket: ctx.bucket,
        Key: key,
      }));
      const body = getResp?.Body;
      existingText = body != null ? await streamToString(body) : '';
    } catch (e) {
      if (e?.$metadata?.httpStatusCode !== 404 && e?.name !== 'NoSuchKey') {
        throw e;
      }
    }

    const lines = existingText.split('\n').filter((l) => l.trim());
    const lastLine = lines.length ? parseAuditLine(lines[lines.length - 1]) : null;

    let newContent;
    if (lastLine && usersNormalized(lastLine.users) === entryUsersNorm) {
      const lastTs = parseInt(lastLine.timestamp, 10) || 0;
      if (nowMs - lastTs <= AUDIT_TIME_WINDOW_MS) {
        lines[lines.length - 1] = formatAuditLine(entry);
        newContent = `${lines.join('\n')}\n`;
      } else {
        const sep = existingText && !existingText.endsWith('\n') ? '\n' : '';
        newContent = `${existingText}${sep}${formatAuditLine(entry)}\n`;
      }
    } else {
      const sep = existingText && !existingText.endsWith('\n') ? '\n' : '';
      newContent = `${existingText}${sep}${formatAuditLine(entry)}\n`;
    }

    const resp = await client.send(new PutObjectCommand({
      Bucket: ctx.bucket,
      Key: key,
      Body: newContent,
      ContentType: 'text/plain; charset=utf-8',
    }));

    return { status: resp?.$metadata?.httpStatusCode ?? 200 };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('writeAuditEntry failed', e);
    return { status: 500 };
  }
}
