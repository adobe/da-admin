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
import formatList, { formatPaginatedList } from '../utils/list.js';

const LIST_LIMIT = 5000;

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
    const remainingKeys = offset + limit - visibleFiles.length;
    // fetch 25 extra to account for some hidden files
    const numKeysToFetch = Math.min(1000, remainingKeys + 25);

    const input = buildInput({ ...daCtx, maxKeys: numKeysToFetch, continuationToken });
    const command = new ListObjectsV2Command(input);

    const resp = await client.send(command);
    continuationToken = resp.NextContinuationToken;
    visibleFiles.push(...formatPaginatedList(resp, daCtx));

    if (!continuationToken) break;
  }

  return visibleFiles.slice(offset, offset + limit);
}

export async function listObjectsPaginated(env, daCtx, maxKeys = 1000, offset = 0) {
  if (offset + maxKeys > LIST_LIMIT) {
    return { status: 400 };
  }

  try {
    const files = await scanFiles({
      daCtx, env, limit: maxKeys, offset,
    });
    return {
      body: JSON.stringify({
        offset,
        limit: maxKeys,
        data: files,
      }),
      status: 200,
    };
  } catch (e) {
    return { body: '', status: 404 };
  }
}

export default async function listObjects(env, daCtx, maxKeys) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const input = buildInput({ ...daCtx, maxKeys });
  const command = new ListObjectsV2Command(input);
  try {
    const resp = await client.send(command);
    const body = formatList(resp, daCtx);
    return {
      body: JSON.stringify(body),
      status: resp.$metadata.httpStatusCode,
      contentType: resp.ContentType,
    };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
