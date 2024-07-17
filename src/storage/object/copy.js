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

export const copyFile = async (env, daCtx, sourceKey, details, isRename) => {
  const key = `${sourceKey.replace(details.source, details.destination)}`;

  try {
    const obj = await env.DA_CONTENT.get(sourceKey);
    if (!obj) {
      return undefined;
    }
    const { body } = obj.text();
    const { httpMetadata, customMetadata } = obj;
    if (isRename) {
      await env.DA_CONTENT.put(key, body, { httpMetadata, customMetadata });
      await env.DA_CONTENT.delete(sourceKey);
    } else {
      await env.DA_CONTENT.put(key, body, { httpMetadata });
    }
    return { success: true, source: sourceKey, destination: key };
  } catch (e) {
    console.log(e);
    return { success: false, source: sourceKey, destination: key };
  }
};

/**
 * @typedef CopyResponse
 * @property {Number} status the status code of the operation
 * @property {String} body the body of the response
 * @property {Array<Object>} body.results list of files to be copied
 * @property {boolean} body.results.source source file
 * @property {boolean} body.results.destination destination file
 * @property {boolean} body.results.success list of files that were successfully copied
 */

/**
 * Copy or rename object(s).
 * @param {Object} env the Cloudflare environment
 * @param {Object} daCtx the execution context
 * @param {Object} details the details about the copy operation
 * @param {String} details.source the source directory
 * @param {String} details.destination the destination directory
 * @param {boolean} isRename indicator if this is a rename operation
 * @return {Promise<Object>} response status of the operation
 */
export default async function copyObject(env, daCtx, details, isRename) {
  if (details.source === details.destination) {
    return { body: '', status: 409 };
  }

  const input = {
    prefix: `${details.source}/`,
    limit: 500,
  };
  const results = [];

  const obj = await env.DA_CONTENT.head(details.source);

  // Head won't return for a folder so this must be a file copy.
  if (obj) {
    await copyFile(env, daCtx, details.source, details, isRename)
      .then((value) => results.push(value));
  } else {
    // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
    // Which means the list will only pickup children. This adds to the initial list.
    const sourceKeys = [details.source, `${details.source}.props`];

    let cursor;
    do {
      const r2list = await env.DA_CONTENT.list({ ...input, cursor });
      const { objects } = r2list;
      cursor = r2list.cursor;
      // List of objects to copy
      sourceKeys.push(...objects.map(({ key }) => key));
    } while (cursor);
    await Promise
      .all(sourceKeys.map((key) => copyFile(env, daCtx, key, details, isRename)))
      .then((values) => results.push(...(values.filter((value) => value))));
  }

  if (!results.length) {
    return { status: 404 };
  } else if (results.some((result) => !result.success)) {
    return { status: 200, body: JSON.stringify({ results }) };
  } else {
    return { status: 201, body: JSON.stringify({ results }) };
  }
}
