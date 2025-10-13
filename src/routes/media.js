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

import { hasPermission } from '../utils/auth.js';
import { MEDIA_TYPES } from '../utils/constants.js';
import { getFileBody, putHelper } from '../helpers/source.js';

export default async function postMedia({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return { status: 403 };

  const obj = await putHelper(req, env, daCtx);
  const { body, type: contentType } = await getFileBody(obj.data);

  if (!MEDIA_TYPES.includes(contentType)) return { status: 400 };

  const adminMediaAPI = env.AEM_ADMIN_MEDIA_API;
  const url = `${adminMediaAPI}/${daCtx.fullKey}/main`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Authorization: `token ${env.AEM_ADMIN_MEDIA_API_KEY}`,
    },
    body,
  });

  if (!resp.ok) return { status: resp.status };
  const data = await resp.json();
  return { status: 200, body: JSON.stringify(data), contentType: 'application/json' };
}
