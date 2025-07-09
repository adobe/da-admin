/*
 * Copyright 2024 Adobe. All rights reserved.
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
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import formatList from '../utils/list.js';

function buildInput({
  org, key, maxKeys, continuationToken,
}) {
  const input = {
    Bucket: `${org}-content`,
    Prefix: key ? `${key}/` : null,
    Delimiter: '/',
  };
  if (maxKeys) input.MaxKeys = maxKeys;
  if (continuationToken) input.ContinuationToken = continuationToken;
  return input;
}

async function scanFiles({
  daCtx, env, offset, limit,
}) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  let continuationToken = null;
  const visibleFiles = [];

  while (visibleFiles.length < offset + limit) {
    const numKeys = Math.min(1000, (offset + limit) * 2);

    const input = buildInput({ ...daCtx, maxKeys: numKeys, continuationToken });
    const command = new ListObjectsV2Command(input);

    const resp = await client.send(command);
    continuationToken = resp.NextContinuationToken;
    visibleFiles.push(...formatList(resp, daCtx));

    if (!continuationToken) break;
  }

  return {
    body: visibleFiles.slice(offset, offset + limit),
    status: 200,
  };
}

export default async function listObjects(env, daCtx, maxKeys = 1000, offset = 0) {
  try {
    const { body, status, contentType } = await scanFiles({
      daCtx, env, limit: maxKeys, offset,
    });
    return {
      body: JSON.stringify(body),
      status,
      contentType,
    };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
