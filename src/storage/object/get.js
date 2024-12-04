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

/**
 * Retrieve a specified object.
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {boolean} head flag to only retrieve head info or body as well.
 * @return {Promise<{Object}>} response object
 */
export default async function getObject(env, daCtx, head = false) {
  const { org, key } = daCtx;
  const daKey = `${org}/${key}`;

  let obj;
  if (head) {
    obj = await env.DA_CONTENT.head(daKey);
  } else {
    obj = await env.DA_CONTENT.get(daKey);
  }
  if (!obj) {
    return { status: 404, body: '' };
  }

  const resp = {
    status: 200,
    contentType: obj.httpMetadata.contentType,
    contentLength: obj.size,
    etag: obj.httpEtag,
    metadata: obj.customMetadata,
  };

  resp.body = obj.text ? (await obj.text()) : '';
  return resp;
}
