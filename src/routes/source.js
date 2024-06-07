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
import deleteObject from '../storage/object/delete.js';

import putHelper from '../helpers/source.js';
import { postObjectVersion } from '../storage/version/put.js';

async function invalidateCollab(api, url, env) {
  const invPath = `/api/v1/${api}?doc=${url}`;

  // Use dacollab service binding, hostname is not relevant
  const invURL = `https://localhost${invPath}`;
  await env.dacollab.fetch(invURL);
}

export async function deleteSource({ req, env, daCtx }) {
  await postObjectVersion(req, env, daCtx);
  const resp = await deleteObject(env, daCtx);

  if (resp.status === 204) {
    const initiator = req.headers.get('x-da-initiator');
    if (initiator !== 'collab') {
      await invalidateCollab('deleteadmin', req.url, env);
    }
  }
  return resp;
}

export async function postSource({ req, env, daCtx }) {
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
  return getObject(env, daCtx, head);
}
