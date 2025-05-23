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
import getObject from '../storage/object/get.js';
import putObject from '../storage/object/put.js';
import deleteObjects from '../storage/object/delete.js';
import { invalidateCollab } from '../storage/utils/object.js';

import putHelper from '../helpers/source.js';
import deleteHelper from '../helpers/delete.js';
import { hasPermission } from '../utils/auth.js';

export async function deleteSource({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return { status: 403 };
  const details = await deleteHelper(req);
  return /* await */ deleteObjects(env, daCtx, details);
}

export async function postSource({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return { status: 403 };
  const obj = await putHelper(req, env, daCtx);
  const resp = await putObject(env, daCtx, obj);

  if (resp.status === 201 || resp.status === 200) {
    const initiator = req.headers.get('x-da-initiator');
    if (initiator !== 'collab') {
      await invalidateCollab('syncadmin', req.url, env);
    }
  }
  return resp;
}

export async function getSource({ env, daCtx, head }) {
  if (!hasPermission(daCtx, daCtx.key, 'read')) return { status: 403 };
  return getObject(env, daCtx, head);
}
