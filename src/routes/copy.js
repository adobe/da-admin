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
import copyObject from '../storage/object/copy.js';
import copyHelper from '../helpers/copy.js';
import { hasPermission } from '../utils/auth.js';

export default async function copyHandler({ req, env, daCtx }) {
  const details = await copyHelper(req, daCtx);
  if (!await hasPermission(daCtx, details.source, 'read')
    || !await hasPermission(daCtx, details.destination, 'write')) return { status: 403 };
  return copyObject(env, daCtx, details, false);
}
