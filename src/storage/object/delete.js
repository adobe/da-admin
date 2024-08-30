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

/**
 * Deletes one or more objects in the storage. Object is specified by the key in the daCtx or a list passed in.
 * Note: folders can not be specified in the `keys` list.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {String[]} [keys=[]] the list of keys to delete (excluding the Org)
 * @return {Promise<{body: null, status: number}>}
 */
export default async function deleteObjects(env, daCtx, keys = []) {
  if (keys.length) {
    const fullKeys = keys.map((key) => `${daCtx.org}/${key}`);
    await env.DA_CONTENT.delete(fullKeys);
    return { body: null, status: 204 };
  }

  const fullKey = `${daCtx.org}/${daCtx.key}`;
  const prefix = `${fullKey}/`;
  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  keys.push(fullKey, `${fullKey}.props`);
  let truncated = false;
  do {
    const r2objects = await env.DA_CONTENT.list({ prefix, limit: 500 });
    const { objects } = r2objects;
    truncated = r2objects.truncated;
    keys.push(...objects.map(({ key }) => key));
    await env.DA_CONTENT.delete(keys);
  } while (truncated);
  return { body: null, status: 204 };
}
