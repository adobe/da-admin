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
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import getS3Config from '../utils/config.js';
import { listCommand } from '../utils/list.js';

export async function deleteObject(client, org, Key) {
  try {
    const delCommand = new DeleteObjectCommand({ Bucket: `${org}-content`, Key });
    const url = await getSignedUrl(client, delCommand, { expiresIn: 3600 });
    return fetch(url, { method: 'DELETE' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`There was an error deleting ${Key}.`);
    return e;
  }
}

export default async function deleteObjects(env, daCtx, details) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const { sourceKeys, continuationToken } = await listCommand(daCtx, details, client);

  await Promise.all(sourceKeys.map(async (key) => {
    await deleteObject(client, daCtx.org, key);
  }));

  return { body: JSON.stringify({ continuationToken }), status: 200 };
}
