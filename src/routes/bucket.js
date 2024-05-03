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

import get from '../storage/bucket/get.js';
import { isAnonymous } from '../utils/auth.js';
import put from '../storage/bucket/put.js';

export async function getBucket({ env, daCtx }) {
  const bucket = await get(env, daCtx);
  const status = bucket ? 200 : 404;
  const body = bucket ? JSON.stringify(bucket) : undefined;
  return {
    body,
    status,
    contentType: 'application/json',
  };
}

export async function postBucket({ env, daCtx }) {
  if (isAnonymous(daCtx)) {
    return { status: 401 };
  }
  const success = await put(env, daCtx);
  const status = success ? 201 : 500;
  return { status };
}
