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
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const Bucket = process.env.AEM_BUCKET_NAME;
const rawPath = (process.argv[2] || '').replace(/^\//, '');
const [Org, ...pathParts] = rawPath.split('/');
const Path = pathParts.join('/');

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
  const snapshots = [];
  const auditKeys = [];
  let token;
  do {
    // eslint-disable-next-line no-await-in-loop
    const resp = await client.send(new ListObjectsV2Command({
      Bucket,
      Prefix: prefix,
      MaxKeys: 500,
      ContinuationToken: token,
    }));
    (resp.Contents || []).forEach((c) => {
      const name = c.Key.slice(prefix.length);
      if (!name) return;
      if (name.startsWith('audit')) auditKeys.push(c.Key);
      else snapshots.push(name);
    });
    token = resp.NextContinuationToken;
  } while (token);

  let auditLines = 0;
  await Promise.all(auditKeys.map(async (key) => {
    try {
      const resp = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      const chunks = [];
      for await (const chunk of resp.Body) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      auditLines += text.split('\n').filter((l) => l.trim()).length;
    } catch { /* ignore */ }
  }));

  return { snapshots, auditLines };
}

async function main() {
  if (!Bucket || !Org || !Path) {
    console.error('Usage: AEM_BUCKET_NAME=bucket node scripts/version-migrate-validate.js <org/repo/path.html>');
    console.error('Example: AEM_BUCKET_NAME=aem-content node scripts/version-migrate-validate.js kptdobe/daplayground/surf.html');
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
  const empty = { snapshots: [], auditLines: 0 };
  const { snapshots, auditLines } = repo ? await listNewVersions(repo, fileId) : empty;

  // Legacy: objects with content = snapshots; empty objects = plain edit markers
  // New: snapshot files + audit lines (plain edits collapsed by dedup window)
  console.log(`FileId:        ${fileId}`);
  console.log(`Path:          ${Path}, repo: ${repo || '(none)'}`);
  console.log(`Legacy objects:    ${legacy.length}`);
  console.log(`New snapshots:     ${snapshots.length}`);
  console.log(`New audit lines:   ${auditLines}`);
  console.log('');
  console.log('Note: audit line count is lower than legacy object count — expected.');
  console.log('      Same-user edits within 30 min are collapsed into one audit line.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
