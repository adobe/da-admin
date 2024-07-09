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

import { isAuthorized } from '../../utils/auth.js';

async function isOrgAuthed(env, daCtx, org) {
  const userAuth = await Promise.all(
    daCtx.users.map(async (user) => isAuthorized(env, org, user)),
  );
  const notAuthed = userAuth.some((auth) => !auth);
  if (notAuthed) return null;
  return { name: org };
}

/**
 * List the orgs for the current context
 * @param {Object} env the Cloudflare Environment
 * @param {Object} daCtx the context
 * @return {Promise<Array<Object>>} the list of orgs
 */
export default async function listOrgs(env, daCtx) {
  try {
    const list = await env.DA_CONTENT.list({ delimiter: '/' });
    const orgs = list.delimitedPrefixes.map((prefix) => (prefix.endsWith('/') ? prefix.substring(0, prefix.length - 1) : prefix));
    const authed = await Promise.all(
      orgs.map((org) => isOrgAuthed(env, daCtx, org)),
    );
    return authed.filter((org) => org);
  } catch (e) {
    return [];
  }
}
