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
import getObject from '../object/get.js';

/**
 * @typedef {Object} PutVersionData
 * @property {String} body the content of the version
 * @property {Object} customMetadta the R2 customMedata object for the version
 * @property {Object} httpMetadata the R2 httpMetadata object for the version
 */

/**
 * Save a version of an object.
 * @param env the CloudFlare environment
 * @param daCtx the DA context
 * @param PutVersionData the data to save
 * @param noneMatch whether to check if version already exists on save
 * @return {Promise<object || null>} the response object or null if the version was not saved
 */
export async function putVersion(env, daCtx, {
  body, customMetadata, httpMetadata,
}, noneMatch = true) {
  // Have to check for existing content. See: https://github.com/cloudflare/workers-sdk/issues/6411
  const head = await env.DA_CONTENT.head(`${daCtx.org}/.da-versions/${customMetadata.id}/${customMetadata.version}.${daCtx.ext}`);
  if (!head || !noneMatch) {
    return env.DA_CONTENT.put(
      `${daCtx.org}/.da-versions/${customMetadata.id}/${customMetadata.version}.${daCtx.ext}`,
      body,
      { customMetadata, httpMetadata },
    );
  }
  return null;
}

/**
 * @typedef {Object} PutObjectUpdate
 * @property {String} key the key of the object
 * @property {String} body the body of the object
 * @property {String} type the content type of the object
 * @property {String} label the label of the version
 */

/**
 * Save the current object as a version, then update it with the new body.
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA context
 * @param {PutObjectUpdate} update the update information
 * @param {boolean} body flag to indicate whether to save the body
 * @return {Promise<number>} status code of the operation
 */
export async function putObjectWithVersion(env, daCtx, update, body) {
  // While we are automatically storing the body once for the 'Collab Parse' changes, we never
  // do a HEAD, because we may need the content. Once we don't need to do this automatic store
  // any more, we can change the 'false' argument in the next line back to !body.
  const tmpCtx = { ...daCtx, key: update.key };
  const current = await getObject(env, tmpCtx, false);
  const id = current.metadata?.id || crypto.randomUUID();
  const version = current.metadata?.version || crypto.randomUUID();
  const users = JSON.stringify(daCtx.users);
  const timestamp = `${Date.now()}`;
  const path = update.key;

  if (current.status === 404) {
    const customMetadata = {
      id, version, users, timestamp, path,
    };
    const onlyIf = { etagDoesNotMatch: '*' };
    const r2o = await env.DA_CONTENT.put(
      `${daCtx.org}/${update.key}`,
      update.body,
      { onlyIf, httpMetadata: { contentType: update.type }, customMetadata },
    );
    if (!r2o) {
      return putObjectWithVersion(env, daCtx, update, body);
    }
    return 201;
  }

  const pps = current.metadata?.preparsingstore || '0';

  // Store the body if preparsingstore is not defined, so a once-off store
  const storeBody = !body && pps === '0';
  const preparsingstore = storeBody ? timestamp : pps;
  const label = storeBody ? 'Collab Parse' : update.label;
  // Version either saves or it doesn't. Failure to save is a collision, which we ignore.
  await putVersion(
    env,
    daCtx,
    {
      body: (body || storeBody ? current.body : ''),
      customMetadata: {
        id,
        version,
        users,
        timestamp: current.metadata?.timestamp || timestamp,
        path: current.metadata?.path || path,
        label,
      },
      httpMetadata: { contentType: current.httpMetadata?.contentType || update.type },
    },
  );

  const onlyIf = { etagMatches: current.etag.replaceAll('"', '') };
  const r2o = await env.DA_CONTENT.put(
    `${daCtx.org}/${update.key}`,
    update.body,
    {
      onlyIf,
      customMetadata: {
        id, version: crypto.randomUUID(), users, timestamp, path, preparsingstore,
      },
      httpMetadata: { contentType: update.type },
    },
  );

  if (!r2o) {
    return putObjectWithVersion(env, daCtx, update, body);
  }
  return 201;
}

/**
 * Create a version of an object in its current state, with an optional label.
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA context
 * @param {String} label the label for the version
 * @return {Promise<{status: number}>} the response object
 */
export async function postObjectVersionWithLabel(env, daCtx, label) {
  const { body, contentType } = await getObject(env, daCtx);
  const { key } = daCtx;

  const resp = await putObjectWithVersion(env, daCtx, {
    key, body, type: contentType, label,
  }, true);

  return { status: resp };
}

/**
 * Create a version of an object in its current state, with an optional label.
 * @param {Request} req request object
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA context
 * @return {Promise<{status: number}>} the response object
 */
export async function postObjectVersion(req, env, daCtx) {
  let reqJSON;
  try {
    reqJSON = await req.json();
  } catch (e) {
    // no body
  }
  const label = reqJSON?.label;

  return postObjectVersionWithLabel(env, daCtx, label);
}
