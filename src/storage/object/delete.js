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
import { invalidateCollab } from '../utils/object.js';
// import { postObjectVersionWithLabel } from '../version/put.js';
import { listCommand } from '../utils/list.js';
import { hasPermission } from '../../utils/auth.js';

export async function deleteObject(daCtx, Key, env /* , isMove = false */) {
  // const fname = Key.split('/').pop();

  // if (fname.includes('.') && !fname.startsWith('.') && !fname.endsWith('.props')) {
  //   const tmpCtx = { ...daCtx, key: Key }; // For next calls, ctx needs the passed
  //   note the Ext also needs to be set ^^^
  //   await postObjectVersionWithLabel(isMove ? 'Moved' : 'Deleted', env, tmpCtx);
  // }

  await env.DA_CONTENT.delete(`${daCtx.org}/${Key}`);

  if (Key.endsWith('.html')) {
    await invalidateCollab('deleteadmin', `${daCtx.origin}/source/${daCtx.org}/${Key}`, env);
  }

  return { status: 204, metadata: { httpStatusCode: 204 } };
}

export default async function deleteObjects(env, daCtx, details) {
  try {
    const { sourceKeys, continuationToken } = await listCommand(daCtx, details);

    const deleteKeys = sourceKeys.filter((key) => hasPermission(daCtx, key, 'write'));
    await Promise.all(deleteKeys.map(async (key) => deleteObject(daCtx, key, env)));

    if (continuationToken) {
      return { body: JSON.stringify({ continuationToken }), status: 206 };
    }
    return { status: 204 };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
