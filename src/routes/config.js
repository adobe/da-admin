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

import putKv from '../storage/kv/put.js';
import getKv from '../storage/kv/get.js';
import { configPermissionPath, hasPermission } from '../utils/auth.js';

// Config access is granted if the user has the action on the resource's own keyword
// (the per-site `/{site}/CONFIG`, or `CONFIG` for org config) OR on the org-level
// `CONFIG` keyword. The latter lets org admins manage any site's config; site rules
// (including `/{site}/**` wildcards) can grant additional access but never restrict it.
function hasConfigPermission(daCtx, action) {
  return hasPermission(daCtx, configPermissionPath(daCtx), action, true)
    || hasPermission(daCtx, 'CONFIG', action, true);
}

export async function postConfig({ req, env, daCtx }) {
  if (!hasConfigPermission(daCtx, 'write')) {
    return { status: 403 };
  }

  return putKv(req, env, daCtx);
}

export async function getConfig({ env, daCtx }) {
  if (!hasConfigPermission(daCtx, 'read')) {
    return { status: 403 };
  }

  return getKv(env, daCtx);
}
