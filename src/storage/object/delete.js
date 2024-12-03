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
import { deleteFromCollab } from '../utils/collab.js';
import { postObjectVersionWithLabel } from '../version/put.js';

export async function deleteObject(env, daCtx, key, isMove = false) {
  const fname = key.split('/').pop();
  if (fname.includes('.') && !key.endsWith('.props')) {
    await postObjectVersionWithLabel(env, daCtx, isMove ? 'Moved' : 'Deleted');
  }
  await env.DA_CONTENT.delete(key);
  await deleteFromCollab(env, daCtx, key);
}
/**
 * Deletes one or more objects in the storage. Object is specified by the key in the daCtx or a list passed in.
 * Note: folders can not be specified in the `keys` list.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @return {Promise<{body: null, status: number}>}
 */
export default async function deleteObjects(env, daCtx) {
  const keys = [];
  const fullKey = `${daCtx.org}/${daCtx.key}`;
  const prefix = `${fullKey}/`;
  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  keys.push(fullKey, `${fullKey}.props`);
  let truncated = false;
  do {
    const r2objects = await env.DA_CONTENT.list({ prefix, limit: 100 });
    const { objects } = r2objects;
    truncated = r2objects.truncated;
    keys.push(...objects.map(({ key }) => key));
    const promises = [];
    keys.forEach((k) => {
      promises.push(deleteObject(env, daCtx, k));
    });
    await Promise.all(promises);
    keys.length = 0;
  } while (truncated);
  return { body: null, status: 204 };
}
