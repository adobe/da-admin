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
/* eslint-disable no-await-in-loop -- do/while with token uses await */
import './load-env.js';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const Bucket = process.env.AEM_BUCKET_NAME;
const args = process.argv.slice(2);
const Org = process.env.ORG || args[0];
const Path = args[1] || args[0];

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

async function getDocumentMeta(path) {
  const key = `${Org}/${path}`;
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
    const id = head.Metadata?.id || head.Metadata?.ID;
    return { id, status: 200 };
  } catch (e) {
    return { status: e.$metadata?.httpStatusCode || 404 };
  }
}

async function listLegacyVersions(fileId) {
  const prefix = `${Org}/.da-versions/${fileId}/`;
  const list = [];
  let token;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket,
      Prefix: prefix,
      MaxKeys: 500,
      ContinuationToken: token,
    }));
    (resp.Contents || []).forEach((c) => {
      const name = c.Key.slice(prefix.length);
      if (name && name !== 'audit.txt') list.push(name);
    });
    token = resp.NextContinuationToken;
  } while (token);
  return list;
}

async function listNewVersions(repo, fileId) {
  const prefix = `${Org}/${repo}/.da-versions/${fileId}/`;
  const list = [];
  let token;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket,
      Prefix: prefix,
      MaxKeys: 500,
      ContinuationToken: token,
    }));
    (resp.Contents || []).forEach((c) => {
      const name = c.Key.slice(prefix.length);
      if (name && name !== 'audit.txt') list.push(name);
    });
    token = resp.NextContinuationToken;
  } while (token);
  return list;
}

async function main() {
  if (!Bucket || !Org || !Path) {
    console.error('Usage: ORG=org node scripts/version-migrate-validate.js [org] <path>');
    console.error('Example: ORG=kptdobe node scripts/version-migrate-validate.js kptdobe test/docs/foo.html');
    process.exit(1);
  }

  const meta = await getDocumentMeta(Path);
  if (meta.status !== 200 || !meta.id) {
    console.error(`Document ${Path} not found or has no id`);
    process.exit(1);
  }

  const fileId = meta.id;
  const repo = Path.includes('/') ? Path.split('/')[0] : '';

  const legacy = await listLegacyVersions(fileId);
  const migrated = repo ? await listNewVersions(repo, fileId) : [];

  console.log(`FileId: ${fileId}, path: ${Path}, repo: ${repo || '(none)'}`);
  console.log(`Legacy prefix count: ${legacy.length}`);
  console.log(`New prefix count: ${migrated.length}`);
  if (legacy.length !== migrated.length) {
    console.log('  Mismatch: legacy vs new count differs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
