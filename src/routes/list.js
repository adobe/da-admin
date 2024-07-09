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
import listObjects from '../storage/object/list.js';
import listOrgs from '../storage/org/list.js';

/**
 * Response object for the list endpoint
 * @typedef {Object} ListResponse
 * @property {String} body the response body
 * @property {Number} status the response status
 * @property {String|undefined} contentType the response content type
 */

/**
 * Lists the objects in the current context - either orgs or objects/folders in an context
 * @param {Object} env the worker environment
 * @param {Object} daCtx current context
 * @return {Promise<ListResponse>} the list
 */
export default async function getList({ env, daCtx }) {
  if (!daCtx.org) {
    const orgs = await listOrgs(env, daCtx);
    if (orgs && orgs.length) {
      return {
        body: JSON.stringify(orgs),
        status: 200,
        contentType: 'application/json',
      };
    } else {
      return { body: '', status: 404 };
    }
  }
  return listObjects(env, daCtx);
}
