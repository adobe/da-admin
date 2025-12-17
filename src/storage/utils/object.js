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
/**
 * Sends a `api` request to collab
 * @param {string} api The API ('syncadmin' or 'deleteadmin')
 * @param {string} url Url of the resource
 * @param {Env} env
 * @returns {Promise<void>}
 */
export async function notifyCollab(api, url, env) {
  if (!url.endsWith('.html')) {
    // collab only deals with .html files, no need to invalidate anything else
    return;
  }

  const invPath = `/api/v1/${api}?doc=${url}`;

  // Use dacollab service binding, hostname is not relevant
  const invURL = `https://localhost${invPath}`;
  const headers = {};
  if (env.COLLAB_SHARED_SECRET) {
    headers.authorization = `token ${env.COLLAB_SHARED_SECRET}`;
  }
  const resp = await env.dacollab.fetch(invURL, {
    // TODO: use POST for state changing operations
    // method: 'POST',
    headers,
  });
  resp.body.cancel();
}
