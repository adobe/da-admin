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
import { deleteObject } from './delete.js';
import { copyFile } from './copy.js';
import { hasPermission } from '../../utils/auth.js';

function buildInput(bucket, org, key) {
  return {
    Bucket: bucket,
    Prefix: `${org}/${key}/`,
  };
}

export default async function moveObject(env, daCtx, details) {
  const config = getS3Config(env);
  const client = new S3Client(config);
  const input = buildInput(daCtx.bucket, daCtx.org, details.source);

  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const initialKeys = [details.source];

  // Only add .props if the source is a folder
  // Note: this is not guaranteed to exist
  if (!daCtx.isFile) initialKeys.push(`${details.source}.props`);

  const results = [];
  let ContinuationToken;

  do {
    try {
      const command = new ListObjectsV2Command({ ...input, ContinuationToken });
      // eslint-disable-next-line no-await-in-loop
      const resp = await client.send(command);

      const { Contents = [], NextContinuationToken } = resp;

      // Include the folder object and .props on the first page only to avoid re-processing
      const pageKeys = [
        ...(!ContinuationToken ? initialKeys : []),
        ...Contents.map(({ Key }) => Key.replace(`${daCtx.org}/`, '')),
      ];

      const movedLoad = pageKeys
        .filter((key) => hasPermission(daCtx, key, 'write'))
        .filter((key) => hasPermission(daCtx, key.replace(details.source, details.destination), 'write'))
        .map(async (key) => {
          const result = { key };
          const copied = await copyFile(config, env, daCtx, key, details, true);
          // Only delete the source if the file was successfully copied
          if (copied.$metadata.httpStatusCode === 200) {
            const deleted = await deleteObject(client, daCtx, key, env, true);
            result.status = deleted.status === 204 ? 204 : deleted.status;
          } else {
            result.status = copied.$metadata.httpStatusCode;
          }
          return result;
        });

      // eslint-disable-next-line no-await-in-loop
      const settled = await Promise.allSettled(movedLoad);
      const failed = settled.filter((r) => r.status === 'rejected');
      if (failed.length) {
        return { body: JSON.stringify({ error: 'partial_failure', failed: failed.length }), status: 500 };
      }
      results.push(...settled.map((r) => r.value));

      ContinuationToken = NextContinuationToken;
    } catch (e) {
      return { body: JSON.stringify({ error: 'move_failed' }), status: 500 };
    }
  } while (ContinuationToken);

  return { status: 204 };
}
