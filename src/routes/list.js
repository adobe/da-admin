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
import listBuckets from '../storage/bucket/list.js';
import listObjects from '../storage/object/list.js';
import { getChildRules, hasDescendantPermission, hasPermission } from '../utils/auth.js';

export default async function getList({ env, daCtx }) {
  if (!daCtx.org) return listBuckets(env, daCtx);

  const canReadDir = hasPermission(daCtx, daCtx.key, 'read');
  if (!canReadDir && !hasDescendantPermission(daCtx, daCtx.key, 'read')) {
    return { status: 403 };
  }

  // Get the child rules of the current folder and store this in daCtx.aclCtx
  getChildRules(daCtx);
  // When the user can't read this folder directly but has permission on some
  // descendant, only the folder itself is authorized as an ancestor - each
  // child must still be checked individually before being shown.
  return /* await */ listObjects(env, daCtx, undefined, !canReadDir);
}
