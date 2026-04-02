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
/* eslint-disable no-await-in-loop -- script: list + concurrency use await in loops */
import './load-env.js';
import {
  S3Client,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const Bucket = process.env.AEM_BUCKET_NAME;
const Org = process.env.ORG || process.argv[2];

/** Process N file IDs in parallel. */
const CONCURRENCY = parseInt(process.env.MIGRATE_ANALYSE_CONCURRENCY || '25', 10);

if (!Bucket || !Org) {
  console.error('Set AEM_BUCKET_NAME and ORG (or pass org as first arg)');
  process.exit(1);
}

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

async function listFileIds() {
  const ids = [];
  let token;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket,
      Prefix: prefix,
      Delimiter: '/',
      MaxKeys: 1000,
      ContinuationToken: token,
    });
    const resp = await client.send(cmd);
    (resp.CommonPrefixes || []).forEach((cp) => {
      const p = cp.Prefix.slice(prefix.length).replace(/\/$/, '');
      if (p) ids.push(p);
    });
    token = resp.NextContinuationToken;
  } while (token);
  return ids;
}

/**
 * Count objects for one file ID using list only (Size in list response; no HEAD).
 * @returns {{ fileId: string, total: number, empty: number, nonEmpty: number }}
 */
async function countObjects(fileId) {
  const listPrefix = `${prefix}${fileId}/`;
  let total = 0;
  let empty = 0;
  let nonEmpty = 0;
  let token;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket,
      Prefix: listPrefix,
      MaxKeys: 1000,
      ContinuationToken: token,
    });
    const resp = await client.send(cmd);
    for (const obj of resp.Contents || []) {
      total += 1;
      const size = obj.Size ?? 0;
      if (size === 0) empty += 1;
      else nonEmpty += 1;
    }
    token = resp.NextContinuationToken;
  } while (token);
  return {
    fileId, total, empty, nonEmpty,
  };
}

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  console.log(`Org: ${Org}, Bucket: ${Bucket}, prefix: ${prefix}`);
  const fileIds = await listFileIds();
  console.log(`File IDs (version folders): ${fileIds.length}`);
  if (fileIds.length === 0) {
    console.log('Nothing to analyse.');
    return;
  }

  console.log(`Analysing all ${fileIds.length} folders (concurrency: ${CONCURRENCY})...`);
  const startMs = Date.now();
  const results = await runWithConcurrency(CONCURRENCY, fileIds, countObjects);
  const elapsedSec = (Date.now() - startMs) / 1000;

  let totalObjects = 0;
  let totalEmpty = 0;
  let totalNonEmpty = 0;
  const withData = results.filter((r) => r.total > 0);

  for (const r of results) {
    totalObjects += r.total;
    totalEmpty += r.empty;
    totalNonEmpty += r.nonEmpty;
  }

  // Clear summary: what you have and what Migrate will do
  console.log('');
  console.log('--- Summary ---');
  console.log(`  File IDs (version folders):  ${fileIds.length}`);
  console.log(`  Total objects (legacy):      ${totalObjects}`);
  console.log(`  Empty (metadata only):       ${totalEmpty}  → will be converted to audit entries`);
  console.log(`  With content (snapshots):    ${totalNonEmpty}  → will be copied to org/repo/.da-versions/fileId/`);
  console.log('');
  console.log('  Migrate will:');
  console.log(`    • Copy ${totalNonEmpty} snapshot(s) to the new path (one per repo/fileId).`);
  console.log(`    • Convert ${totalEmpty} empty object(s) to audit lines in audit.txt (same-user + 30 min dedup per file; version entries do not collapse). Final line count is lower — run Migrate with DRY_RUN=1 to see exact numbers.`);
  console.log('    • Merge with any existing audit.txt already in the new path (hybrid case).');
  console.log('');
  const idsPerSec = fileIds.length / elapsedSec;
  const objectsPerSec = totalObjects / elapsedSec;
  console.log(
    `  Timing: ${elapsedSec.toFixed(1)}s total | ${idsPerSec.toFixed(0)} file IDs/s | ${objectsPerSec.toFixed(0)} objects/s`,
  );

  if (verbose && withData.length > 0) {
    console.log('');
    console.log('--- Per-file breakdown ---');
    for (const r of withData.sort((a, b) => b.total - a.total)) {
      console.log(`  ${r.fileId}: total=${r.total} empty=${r.empty} nonEmpty=${r.nonEmpty}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
