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
import listObjects from '../storage/object/list.js';
import { getChildRules, hasPermission } from '../utils/auth.js';

export default async function getList({ env, daCtx }) {
  if (!daCtx.org) return { status: 404 };
  if (!hasPermission(daCtx, daCtx.key, 'read')) return { status: 403 };

  // Get the child rules of the current folder and store this in daCtx.aclCtx
  getChildRules(daCtx);
  return /* await */ listObjects(env, daCtx);
}
