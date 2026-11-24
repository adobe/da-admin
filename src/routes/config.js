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

/**
 * Grants config access through either the resource CONFIG keyword or the org CONFIG keyword.
 * Site rules can grant additional access but cannot restrict an org config administrator.
 * @param {Object} daCtx DA context with the resource key, users and org-scoped ACLs.
 * @param {string} action Required config action.
 * @returns {boolean} Whether either config permission grants the action.
 */
export function hasConfigPermission(daCtx, action) {
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
