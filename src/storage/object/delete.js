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
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import getS3Config from '../utils/config.js';
import { notifyCollab } from '../utils/object.js';
// import { postObjectVersionWithLabel } from '../version/put.js';
import { listCommand } from '../utils/list.js';
import { hasPermission } from '../../utils/auth.js';

export async function deleteObject(client, daCtx, Key, env /* , isMove = false */) {
  // const fname = Key.split('/').pop();

  // if (fname.includes('.') && !fname.startsWith('.') && !fname.endsWith('.props')) {
  //   const tmpCtx = { ...daCtx, key: Key }; // For next calls, ctx needs the passed
  //   note the Ext also needs to be set ^^^
  //   await postObjectVersionWithLabel(isMove ? 'Moved' : 'Deleted', env, tmpCtx);
  // }

  let resp;
  try {
    const delCommand = new DeleteObjectCommand({ Bucket: daCtx.bucket, Key: `${daCtx.org}/${Key}` });
    const url = await getSignedUrl(client, delCommand, { expiresIn: 3600 });
    resp = await fetch(url, { method: 'DELETE' });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`There was an error deleting ${Key}.`);
    return e;
  }

  if (Key.endsWith('.html')) {
    await notifyCollab('deleteadmin', `${daCtx.origin}/source/${daCtx.org}/${Key}`, env);
  }

  return resp;
}

export default async function deleteObjects(env, daCtx, details) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  try {
    const { sourceKeys, continuationToken } = await listCommand(daCtx, details, client);

    const deleteKeys = sourceKeys.filter((key) => hasPermission(daCtx, key, 'write'));
    await Promise.all(deleteKeys.map(async (key) => deleteObject(client, daCtx, key, env)));

    if (continuationToken) {
      return { body: JSON.stringify({ continuationToken }), status: 206 };
    }
    return { status: 204 };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
