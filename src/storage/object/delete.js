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

const MAX_KEYS = 100;

/**
 * Deletes an object in the storage, creating a version of it if necessary.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {String} key the key of the object to delete (excluding Org)
 * @param {Boolean} isMove if this was initiated by a move operation
 * @return {Promise<void>}
 */
export async function deleteObject(env, daCtx, key, isMove = false) {
  const fname = key.split('/').pop();

  const tmpCtx = { ...daCtx, key }; // For next calls, ctx needs the passed key, as it could contain a folder
  if (daCtx.isFile && fname.includes('.') && !key.endsWith('.props')) {
    await postObjectVersionWithLabel(env, tmpCtx, isMove ? 'Moved' : 'Deleted');
  }
  await env.DA_CONTENT.delete(`${daCtx.org}/${key}`);
  await deleteFromCollab(env, tmpCtx);
}
/**
 * Deletes an object in the storage, creating a version of it if necessary.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {String} key the key of the object to delete (excluding Org)
 * @param {Boolean} isMove if this was initiated by a move operation
 * @return {Promise<void>}
 */
export async function deleteObject(env, daCtx, key, isMove = false) {
  const fname = key.split('/').pop();

  const tmpCtx = { ...daCtx, key }; // For next calls, ctx needs the passed key, as it could contain a folder
  if (fname.indexOf('.') > 0 && !key.endsWith('.props')) {
    await postObjectVersionWithLabel(env, tmpCtx, isMove ? 'Moved' : 'Deleted');
  }
  await env.DA_CONTENT.delete(`${daCtx.org}/${key}`);
  await deleteFromCollab(env, tmpCtx);
}
/**
 * Deletes one or more objects in the storage. Object is specified by the key in the daCtx or a list passed in.
 * Note: folders can not be specified in the `keys` list.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {Object} details the details about the delete operation
 * @return {Promise<{body: {}, status: number}>}
 */
export default async function deleteObjects(env, daCtx, details) {
  if (daCtx.isFile) {
    await deleteObject(env, daCtx, daCtx.key);
    return { body: null, status: 204 };
  }

  const keys = [];
  if (!daCtx.isFile && !details.continuationToken) {
    keys.push(`${daCtx.key}.props`);
  }
  const prefix = `${daCtx.org}/${daCtx.key}/`;
  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const r2objects = await env.DA_CONTENT.list({ prefix, limit: MAX_KEYS });
  const { objects, cursor } = r2objects;
  keys.push(...objects.map(({ key }) => key.split('/').slice(1).join('/')));
  const promises = [];
  keys.forEach((k) => {
    promises.push(deleteObject(env, daCtx, k));
  });
  await Promise.all(promises);

  if (cursor) {
    return { body: JSON.stringify({ continuationToken: cursor }), status: 206 };
  } else {
    return { body: null, status: 204 };
  }
}
