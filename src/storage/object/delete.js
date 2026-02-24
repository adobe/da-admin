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
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { notifyCollab } from '../utils/object.js';

// eslint-disable-next-line import/prefer-default-export
export async function deleteObject(client, daCtx, Key, env) {
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
    try {
      await notifyCollab('deleteadmin', `${daCtx.origin}/source/${daCtx.org}/${Key}`, env);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to notify collab', e);
    }
  }

  return resp;
}
