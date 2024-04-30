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
import { patchObjectVersion } from '../storage/version/patch.js';
import { postObjectVersion } from '../storage/version/put.js';

export async function getVersionList({ env, daCtx }) {
  return listObjectVersions(env, daCtx);
}

export async function getVersionSource({ env, daCtx, head }) {
  return getObjectVersion(env, daCtx, head);
}

export async function patchVersion({ req, env, daCtx }) {
  return patchObjectVersion(req, env, daCtx);
}

export async function postVersionSource({ env, daCtx }) {
  return postObjectVersion(env, daCtx);
}
