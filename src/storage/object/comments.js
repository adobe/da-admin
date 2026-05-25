/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import getS3Config from '../utils/config.js';
import { ifMatch, ifNoneMatch } from '../utils/version.js';

const MAX_ATTEMPTS = 3;
const EMPTY_STATE = () => ({ version: 1, threads: {} });

export async function readCommentsFile(env, org, key) {
  const client = new S3Client(getS3Config(env));
  try {
    const resp = await client.send(new GetObjectCommand({
      Bucket: env.AEM_BUCKET_NAME,
      Key: `${org}/${key}`,
    }));
    const text = await resp.Body.transformToString();
    return { state: JSON.parse(text), etag: resp.ETag ?? null };
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404) {
      return { state: EMPTY_STATE(), etag: null };
    }
    throw err;
  }
}

export async function writeCommentsFile(env, org, key, state, etag) {
  const config = getS3Config(env);
  // First write: use If-None-Match: * to ensure the file didn't pop into existence
  // after our GET returned 404. Subsequent writes: If-Match the etag we saw.
  const client = etag ? ifMatch(config, etag) : ifNoneMatch(config, '*');
  try {
    const resp = await client.send(new PutObjectCommand({
      Bucket: env.AEM_BUCKET_NAME,
      Key: `${org}/${key}`,
      Body: JSON.stringify(state),
      ContentType: 'application/json',
    }));
    return { ok: true, etag: resp.ETag ?? null };
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 412) {
      return { ok: false, conflict: true };
    }
    throw err;
  }
}

/**
 * Run `mutate(state)` against the latest server snapshot under If-Match. If the
 * write loses a precondition race, refetch and retry. Up to MAX_ATTEMPTS.
 *
 * `mutate(state)` may return either:
 *   - a plain value (e.g. `{ id: ... }`) -> success, used as the wrapper's result.
 *   - `{ error: 'code', status: 4xx }` -> short-circuit; no write happens; this
 *     is returned as the result and the caller maps it to a response.
 *
 * Wrapper return:
 *   - `{ ok: true, result }` on success.
 *   - `{ ok: false, error: 'code', status: 4xx }` if mutate short-circuited.
 *   - `{ ok: false, error: 'conflict_exhausted', status: 409 }` if all
 *     attempts lost the precondition race.
 */
export async function atomicMutation(env, org, key, mutate) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { state, etag } = await readCommentsFile(env, org, key);
    // eslint-disable-next-line no-await-in-loop
    const result = await mutate(state);
    if (result && result.error) return { ok: false, ...result };
    // eslint-disable-next-line no-await-in-loop
    const writeResp = await writeCommentsFile(env, org, key, state, etag);
    if (writeResp.ok) return { ok: true, result };
    // Conflict: loop and retry.
  }
  return { ok: false, error: 'conflict_exhausted', status: 409 };
}
