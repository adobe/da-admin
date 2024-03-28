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

import { getUsers, isAuthorized } from './auth.js';

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

  // Set base details
  const daCtx = {
    path: pathname,
    api,
    org,
    users,
    fullKey,
  };

  // Get org properties
  daCtx.authorized = true;
  // check for all users in the session if they are authorized
  for (const user of users) {
    if (!await isAuthorized(env, org, user)) {
      daCtx.authorized = false;
    }
  }

  // Sanitize the remaining path parts
  const path = parts.filter((part) => part !== '');
  const keyBase = path.join('/');

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

  return daCtx;
}
