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
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import formatList from '../utils/list.js';
import { hasDescendantPermission, hasPermission } from '../../utils/auth.js';

function buildInput({
  bucket, org, key, maxKeys, continuationToken,
}) {
  const input = {
    Bucket: bucket,
    Prefix: key ? `${org}/${key}/` : `${org}/`,
    Delimiter: '/',
  };
  if (maxKeys) input.MaxKeys = maxKeys;
  if (continuationToken) input.ContinuationToken = continuationToken;
  return input;
}

// Only used when the caller couldn't read the listed folder directly, but got
// in because some descendant is permitted (see src/routes/list.js). Every
// child then needs its own check: folders may lead to a permitted descendant
// even if not directly readable, but files have no descendants to fall back on.
function filterUnauthorized(daCtx, items) {
  // item.path is bucket-relative (starts with /{org}/...) since one bucket is
  // shared across orgs, but permissions are org-scoped and keyed off
  // org-relative paths (like daCtx.key) - so the org segment must be stripped
  // before checking.
  const orgPrefix = `/${daCtx.org}`;
  return items.filter((item) => {
    const relPath = item.path.slice(orgPrefix.length) || '/';
    return hasPermission(daCtx, relPath, 'read')
      || (!item.ext && hasDescendantPermission(daCtx, relPath, 'read'));
  });
}

export default async function listObjects(env, daCtx, maxKeys, restrictToPermitted = false) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const input = buildInput({
    ...daCtx,
    maxKeys,
  });
  const command = new ListObjectsV2Command(input);
  try {
    const resp = await client.send(command);
    // console.log(resp);
    const body = restrictToPermitted
      ? filterUnauthorized(daCtx, formatList(resp))
      : formatList(resp);
    const nextContinuationToken = resp.IsTruncated
      && resp.NextContinuationToken
      && resp.NextContinuationToken !== daCtx.continuationToken
      ? resp.NextContinuationToken
      : undefined;
    return {
      body: JSON.stringify(body),
      status: resp.$metadata.httpStatusCode,
      contentType: resp.ContentType,
      continuationToken: nextContinuationToken,
    };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
