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

import { getObjectVersion } from '../storage/version/get.js';
import { listObjectVersions } from '../storage/version/list.js';
import { postObjectVersion } from '../storage/version/put.js';
import { hasPermission } from '../utils/auth.js';

export async function getVersionList({ env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'read')) return { status: 403 };
  return listObjectVersions(env, daCtx);
}

export async function getVersionSource({ env, daCtx, head }) {
  // daCtx.key is something like
  // 'f85f9b05-ae48-485b-a3b3-dd203ac5c734/1b7e005b-8602-4053-b920-8e67ad8e8dba.html'
  // so we have to do the permission check when the object is returned from the metadata.

  const resp = await getObjectVersion(env, daCtx, head, daCtx.conditionalHeaders);
  if (!hasPermission(daCtx, resp.metadata?.path, 'read')) return { status: 403 };
  return resp;
}

export async function postVersionSource({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return { status: 403 };
  return postObjectVersion(req, env, daCtx);
}
