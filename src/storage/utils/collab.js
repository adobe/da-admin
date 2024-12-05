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

async function invalidateCollab(env, daCtx, api) {
  if (daCtx.initiator === 'collab' || !daCtx.key.endsWith('.html')) {
    return;
  }
  const invPath = `/api/v1/${api}?doc=${daCtx.origin}/${daCtx.api}/${daCtx.org}/${daCtx.key}`;
  // Use dacollab service binding, hostname is not relevant
  const invURL = `https://localhost${invPath}`;
  await env.dacollab.fetch(invURL);
}

/**
 * Removes the specified URL from the Collab cache.
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @return {Promise<void>}
 */
export async function deleteFromCollab(env, daCtx) {
  await invalidateCollab(env, daCtx, 'deleteadmin');
}

/**
 * Forces a sync in DaCollab for the specified URL.
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @return {Promise<void>}
 */
export async function syncCollab(env, daCtx) {
  await invalidateCollab(env, daCtx, 'syncadmin');
}
