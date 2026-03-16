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
/* eslint-disable no-await-in-loop -- migration script: sequential to avoid rate limits */
import './load-env.js';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const Bucket = process.env.AEM_BUCKET_NAME;
const Org = process.env.ORG || process.argv[2];

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
      try {
        const head = await client.send(new HeadObjectCommand({
          Bucket,
          Key: obj.Key,
        }));
        const len = head.ContentLength ?? 0;
        if (len === 0) empty += 1;
        else nonEmpty += 1;
      } catch {
        total -= 1;
      }
    }
    token = resp.NextContinuationToken;
  } while (token);
  return { total, empty, nonEmpty };
}

async function main() {
  console.log(`Org: ${Org}, Bucket: ${Bucket}, prefix: ${prefix}`);
  const fileIds = await listFileIds();
  console.log(`File IDs (version folders): ${fileIds.length}`);

  let totalObjects = 0;
  let totalEmpty = 0;
  let totalNonEmpty = 0;

  const sampleIds = fileIds.slice(0, 50);
  for (const fileId of sampleIds) {
    const { total, empty, nonEmpty } = await countObjects(fileId);
    totalObjects += total;
    totalEmpty += empty;
    totalNonEmpty += nonEmpty;
    if (total > 0) {
      console.log(`  ${fileId}: total=${total} empty=${empty} nonEmpty=${nonEmpty}`);
    }
  }

  if (fileIds.length > 50) {
    console.log(`  ... (showing first 50; run full count by iterating all ${fileIds.length} IDs)`);
  }

  console.log(`Sample totals (first ${Math.min(50, fileIds.length)} IDs): ${totalObjects} objects, ${totalEmpty} empty, ${totalNonEmpty} with content`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
