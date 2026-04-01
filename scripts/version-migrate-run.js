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
/* eslint-disable no-await-in-loop, no-continue -- migration: sequential; skip audit.txt */
import './load-env.js';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const Bucket = process.env.AEM_BUCKET_NAME;
const Org = process.env.ORG || process.argv[2];
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

/** Must match src/storage/version/audit.js AUDIT_TIME_WINDOW_MS for consistent dedup. */
const AUDIT_WINDOW_MS = 30 * 60 * 1000;
/** Must match src/storage/version/audit.js AUDIT_MAX_ENTRIES. */
const AUDIT_MAX_ENTRIES = 500;

const config = {
  region: 'auto',
  endpoint: process.env.S3_DEF_URL,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
};
if (process.env.S3_FORCE_PATH_STYLE === 'true') config.forcePathStyle = true;

const client = new S3Client(config);
const prefix = `${Org}/.da-versions/`;

/** Process N file IDs in parallel. */
const CONCURRENCY = parseInt(process.env.MIGRATE_RUN_CONCURRENCY || '15', 10);

async function runWithConcurrency(limit, items, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    p.finally(() => {
      executing.delete(p);
    });
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/** Must match src/storage/version/put.js shouldCreateVersion. */
function shouldCreateVersion(contentType) {
  if (!contentType) return false;
  const type = contentType.toLowerCase();
  return type.startsWith('text/html') || type.startsWith('application/json');
}

function getRepoFromPath(path) {
  if (!path || typeof path !== 'string') return '';
  const first = path.split('/')[0];
  return first || '';
}

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
 * Dedupe audit entries: same-user edits within AUDIT_WINDOW_MS collapse (keep last).
 * Labelled versions never collapse (match audit.js: version entries "interrupt" the window).
 */
function dedupeAuditEntries(entries) {
  const out = [];
  const isVersionEntry = (e) => (e?.versionLabel ?? '') !== '' || (e?.versionId ?? '') !== '';
  for (const e of entries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) {
    const last = out[out.length - 1];
    const ts = parseInt(e.timestamp, 10) || 0;
    const userNorm = usersNormalized(e.users);
    const lastTs = parseInt(last?.timestamp, 10) || 0;
    const sameUser = last && usersNormalized(last.users) === userNorm;
    const inWindow = sameUser && (ts - lastTs <= AUDIT_WINDOW_MS);
    const lastIsVersion = last && isVersionEntry(last);
    const canCollapse = inWindow && !isVersionEntry(e) && !lastIsVersion;
    if (canCollapse) {
      out[out.length - 1] = e;
    } else {
      out.push(e);
    }
  }
  return out;
}

/** Normalize path (strip repo prefix) and versionId (strip extension) for audit storage. */
function normalizeAuditEntry(entry, repo) {
  const path = (repo && entry.path && entry.path.startsWith(`${repo}/`))
    ? entry.path.slice(repo.length)
    : (entry.path ?? '');
  let { versionId } = entry;
  if (versionId && typeof versionId === 'string' && versionId.includes('.')) {
    versionId = versionId.replace(/\.[^.]+$/, '');
  }
  return { ...entry, path, versionId };
}

function formatAuditLine(entry) {
  const versionLabel = entry.versionLabel ?? '';
  const versionId = entry.versionId ?? '';
  return [entry.timestamp, entry.users, entry.path, versionLabel, versionId].join('\t');
}

/** Parse one audit line (ts, users, path, versionLabel?, versionId?). Same format as audit.js. */
function parseAuditLine(line) {
  const t = line.trim();
  if (!t) return null;
  const parts = t.split('\t');
  if (parts.length < 3) return null;
  let versionLabel = '';
  let versionId = '';
  if (parts.length >= 5) {
    versionId = parts.pop();
    versionLabel = parts.pop();
  } else if (parts.length >= 4) {
    versionId = parts.pop();
  }
  const path = parts.slice(2).join('\t');
  return {
    timestamp: parts[0],
    users: parts[1],
    path,
    versionLabel,
    versionId,
  };
}

/** In hybrid case, new path may already have audit.txt. Read and merge with legacy entries. */
async function readExistingAuditInNewPath(repo, fileId) {
  const auditKey = `${Org}/${repo}/.da-versions/${fileId}/audit.txt`;
  try {
    const resp = await client.send(new GetObjectCommand({ Bucket, Key: auditKey }));
    const body = resp.Body;
    let text = '';
    if (body) {
      if (typeof body.transformToByteArray === 'function') {
        const bytes = await body.transformToByteArray();
        text = new TextDecoder().decode(bytes);
      } else {
        const chunks = [];
        for await (const chunk of body) chunks.push(chunk);
        text = Buffer.concat(chunks).toString('utf8');
      }
    }
    const lines = text.split('\n').map(parseAuditLine).filter(Boolean);
    return lines;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') return [];
    throw e;
  }
}

async function listFileIds() {
  const ids = [];
  let token;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket,
      Prefix: prefix,
      Delimiter: '/',
      MaxKeys: 1000,
      ContinuationToken: token,
    }));
    (resp.CommonPrefixes || []).forEach((cp) => {
      const p = cp.Prefix.slice(prefix.length).replace(/\/$/, '');
      if (p) ids.push(p);
    });
    token = resp.NextContinuationToken;
  } while (token);
  return ids;
}

async function migrateFileId(fileId) {
  const listPrefix = `${prefix}${fileId}/`;
  const objects = [];
  let token;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket,
      Prefix: listPrefix,
      MaxKeys: 1000,
      ContinuationToken: token,
    }));
    (resp.Contents || []).forEach((c) => objects.push(c.Key));
    token = resp.NextContinuationToken;
  } while (token);

  const snapshots = [];
  const auditEntries = [];
  const snapshotAuditEntries = [];

  for (const Key of objects) {
    const head = await client.send(new HeadObjectCommand({ Bucket, Key }));
    const contentLength = head.ContentLength ?? 0;
    const meta = head.Metadata || {};
    const path = meta.path || meta.Path || '';
    const timestamp = meta.timestamp || meta.Timestamp || '';
    const users = meta.users || meta.Users || '[{"email":"anonymous"}]';
    const versionLabel = meta.label || meta.Label || '';
    const repo = getRepoFromPath(path);

    const contentType = head.ContentType || '';
    const name = Key.split('/').pop();
    if (name !== 'audit.txt' && shouldCreateVersion(contentType)) {
      if (contentLength > 0) {
        snapshots.push({
          Key,
          repo,
          name,
          copySource: `${Bucket}/${Key}`,
        });
        const versionId = name.includes('.') ? name.replace(/\.[^.]+$/, '') : name;
        snapshotAuditEntries.push({
          timestamp, users, path, versionLabel, versionId,
        });
      } else {
        auditEntries.push({ timestamp, users, path });
      }
    }
  }

  const repoSet = new Set(snapshots.map((s) => s.repo).filter(Boolean));
  const repoFromAudit = (auditEntries.length ? getRepoFromPath(auditEntries[0]?.path) : '')
    || (snapshotAuditEntries.length ? getRepoFromPath(snapshotAuditEntries[0]?.path) : '');
  if (repoFromAudit) repoSet.add(repoFromAudit);
  let repo = '';
  if (repoSet.size === 1) {
    const [firstRepo] = repoSet;
    repo = firstRepo;
  } else if (repoSet.size > 1) repo = 'unknown';

  const allLegacyAudit = [...auditEntries, ...snapshotAuditEntries];
  let auditLines = 0;
  if (allLegacyAudit.length && repo) {
    const dedupedLegacy = dedupeAuditEntries(allLegacyAudit);
    const existingInNew = await readExistingAuditInNewPath(repo, fileId);
    const combined = [...dedupedLegacy, ...existingInNew].sort(
      (a, b) => (parseInt(a.timestamp, 10) || 0) - (parseInt(b.timestamp, 10) || 0),
    );
    const deduped = dedupeAuditEntries(combined);
    const normalized = deduped.map((e) => normalizeAuditEntry(e, repo));
    auditLines = normalized.length;
    if (!DRY_RUN) {
      // Split into chunks of AUDIT_MAX_ENTRIES; all but the last become archive files.
      for (let i = 0; i < normalized.length; i += AUDIT_MAX_ENTRIES) {
        const chunk = normalized.slice(i, i + AUDIT_MAX_ENTRIES);
        const body = `${chunk.map(formatAuditLine).join('\n')}\n`;
        const isLast = i + AUDIT_MAX_ENTRIES >= normalized.length;
        const lastTs = chunk[chunk.length - 1].timestamp;
        const key = isLast
          ? `${Org}/${repo}/.da-versions/${fileId}/audit.txt`
          : `${Org}/${repo}/.da-versions/${fileId}/audit-${lastTs}.txt`;
        await client.send(new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: 'text/plain; charset=utf-8',
        }));
      }
    }
  }

  if (!DRY_RUN) {
    for (const s of snapshots) {
      const destRepo = s.repo || repo;
      if (destRepo) {
        const destKey = `${Org}/${destRepo}/.da-versions/${fileId}/${s.name}`;
        await client.send(new CopyObjectCommand({
          Bucket,
          CopySource: s.copySource,
          Key: destKey,
        }));
      }
    }
  }

  return {
    fileId,
    snapshots: snapshots.length,
    audit: auditEntries.length,
    auditLines,
    repo: repo || '(none)',
  };
}

async function main() {
  if (!Bucket || !Org) {
    console.error('Set AEM_BUCKET_NAME and ORG (or pass org as first arg)');
    process.exit(1);
  }
  console.log(`Org: ${Org}, Bucket: ${Bucket}, DRY_RUN: ${DRY_RUN}`);

  const fileIds = await listFileIds();
  console.log(`File IDs to process: ${fileIds.length} (concurrency: ${CONCURRENCY})`);
  console.log('');

  const startMs = Date.now();
  const results = await runWithConcurrency(CONCURRENCY, fileIds, async (fileId) => {
    try {
      const result = await migrateFileId(fileId);
      console.log(`  ${fileId}: ${result.snapshots} snapshots, ${result.auditLines} audit lines -> repo ${result.repo}`);
      return { fileId, ...result, error: null };
    } catch (e) {
      console.error(`  ${fileId}: error`, e.message);
      return {
        fileId, snapshots: 0, audit: 0, auditLines: 0, repo: '', error: e,
      };
    }
  });

  const errors = results.filter((r) => r.error);
  const ok = results.filter((r) => !r.error);
  const elapsedSec = (Date.now() - startMs) / 1000;

  if (DRY_RUN && ok.length > 0) {
    const totalSnapshots = ok.reduce((sum, r) => sum + r.snapshots, 0);
    const totalAuditLines = ok.reduce((sum, r) => sum + (r.auditLines || 0), 0);
    const filesWithAudit = ok.filter((r) => (r.auditLines || 0) > 0).length;
    console.log('');
    console.log('--- DRY RUN summary (no changes were made) ---');
    console.log(`  File IDs processed:     ${ok.length}${errors.length > 0 ? ` (${errors.length} error(s))` : ''}`);
    console.log(`  Snapshots would copy:   ${totalSnapshots}`);
    console.log(`  audit.txt would write:  ${filesWithAudit} file(s), ${totalAuditLines} total lines (after dedup + merge)`);
    const idsPerSec = ok.length / elapsedSec;
    console.log(`  Timing: ${elapsedSec.toFixed(1)}s total | ${idsPerSec.toFixed(1)} file IDs/s`);
    console.log('  Compare with Analyse: "With content" ≈ snapshots above; run without DRY_RUN to apply.');
  } else if (errors.length > 0) {
    console.log('');
    console.log(`Done. ${results.length} processed, ${errors.length} error(s).`);
  }

  if (ok.length > 0 && !DRY_RUN) {
    const totalSnapshots = ok.reduce((sum, r) => sum + r.snapshots, 0);
    const totalAuditLines = ok.reduce((sum, r) => sum + (r.auditLines || 0), 0);
    console.log('');
    console.log(`Completed in ${elapsedSec.toFixed(1)}s | ${(ok.length / elapsedSec).toFixed(1)} file IDs/s | ${totalSnapshots} snapshots copied, ${totalAuditLines} audit lines written`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
