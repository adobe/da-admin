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

import { getAclCtx, getUsers } from './auth.js';

/**
 * Gets Dark Alley Context
 * @param {pathname} pathname
 * @returns {DaCtx} The Dark Alley Context.
 */
export default async function getDaCtx(req, env) {
  let { pathname } = new URL(req.url);
  // Remove proxied api route
  if (pathname.startsWith('/api')) pathname = pathname.replace('/api', '');

  const users = await getUsers(req, env);

  // Santitize the string
  const lower = pathname.slice(1).toLowerCase();
  const sanitized = lower.endsWith('/') ? lower.slice(0, -1) : lower;

  // Get base details
  const split = sanitized.split('/');
  const api = split.shift();
  const fullKey = split.join('/');
  const [org, ...parts] = split;
  const bucket = env.AEM_BUCKET_NAME;

  // Extract conditional headers
  const ifMatch = req.headers?.get('if-match') || null;
  const ifNoneMatch = req.headers?.get('if-none-match') || null;

  // Set base details
  const daCtx = {
    path: pathname,
    api,
    bucket,
    org,
    users,
    fullKey,
    origin: new URL(req.url).origin,
    method: req.method,
    conditionalHeaders: {
      ifMatch,
      ifNoneMatch,
    },
  };

  // Sanitize the remaining path parts
  const path = parts.filter((part) => part !== '');
  const keyBase = path.join('/');

  const pnlc = pathname.toLocaleLowerCase();
  const validPath = `/${api}/${org}/${keyBase}`;

  if (!org || !(pnlc === validPath || pnlc === `${validPath}/`)) {
    throw new Error('Invalid path');
  }

  // Get the final source name
  daCtx.filename = path.pop() || '';

  [daCtx.site] = path;

  // Handle folders and files under a site
  const fileSplit = daCtx.filename.split('.');
  daCtx.isFile = fileSplit.length > 1;
  if (daCtx.isFile) daCtx.ext = fileSplit.pop();
  daCtx.name = fileSplit.join('.');

  // Set keys
  daCtx.key = keyBase;
  daCtx.propsKey = `${daCtx.key}.props`;

  // Set paths for API consumption
  const aemParts = daCtx.site ? path.slice(1) : path;
  const aemPathBase = [...aemParts, daCtx.name].join('/');
  const daPathBase = [...path, daCtx.name].join('/');

  if (!daCtx.ext || daCtx.ext === 'html') {
    daCtx.pathname = `/${daPathBase}`;
    daCtx.aemPathname = `/${aemPathBase}`;
  } else {
    daCtx.pathname = `/${daPathBase}.${daCtx.ext}`;
    daCtx.aemPathname = `/${aemPathBase}.${daCtx.ext}`;
  }

  daCtx.aclCtx = await getAclCtx(env, org, users, keyBase, api);
  daCtx.authorized = daCtx.aclCtx.actionSet.has('read');

  return daCtx;
}
