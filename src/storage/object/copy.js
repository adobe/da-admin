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

const limit = 100;

/**
 * Copies the specified file from the source to the destination.
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA Context
 * @param {String} sourceKey the key for the source file
 * @param {String} destinationKey the key for the destination file
 * @param {Boolean} isRename whether this is a rename operation
 * @return {Promise<Object>} the status of the copy operation
 */
const copyFile = async (env, daCtx, sourceKey, destinationKey, isRename) => {
  try {
    const obj = await env.DA_CONTENT.get(sourceKey);
    if (!obj) {
      return { success: false, source: sourceKey, destination: destinationKey };
    }

    const body = await obj.text();
    const { httpMetadata } = obj;
    // We want to keep the history if this was a rename. In case of an actual
    // copy we should start with clean history. The history is associated with the
    // ID of the object, so we need to generate a new ID for the object and also a
    // new ID for the version. We set the user to the user making the copy.
    const customMetadata = {
      id: crypto.randomUUID(),
      version: crypto.randomUUID(),
      timestamp: `${Date.now()}`,
      users: JSON.stringify(daCtx.users),
      path: destinationKey,
    };
    if (isRename) Object.assign(customMetadata, obj.customMetadata, { path: destinationKey });

    await env.DA_CONTENT.put(destinationKey, body, { httpMetadata, customMetadata });
    if (isRename) await env.DA_CONTENT.delete(sourceKey);
    return { success: true, source: sourceKey, destination: destinationKey };
    /* c8 ignore next 4 */
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Failed to copy: ${sourceKey} to ${destinationKey}`, e);
    return { success: false, source: sourceKey, destination: destinationKey };
  }
};

const copyFiles = async (env, daCtx, detailsList, isRename) => {
  const results = [];
  while (detailsList.length > 0) {
    const promises = [];
    do {
      const { src, dest } = detailsList.shift();
      promises.push(copyFile(env, daCtx, src, dest, isRename));
    } while (detailsList.length > 0 && promises.length <= limit);
    await Promise.all(promises).then((values) => results.push(...values));
  }
  return results;
};

/**
 * Copies a directory (and contents) or a single file to location.
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA Context
 * @param {Object} details the source & details of the copy operation
 * @param {string} details.source the source directory or file
 * @param {string} details.destination the destination directory or file
 * @param {Boolean=false} isRename whether this is a rename operation
 * @return {Promise<{ status }>}
 */
export default async function copyObject(env, daCtx, details, isRename = false) {
  if (details.source === details.destination) {
    return { body: '', status: 409 };
  }
  const results = [];
  const src = details.source.length ? `${daCtx.org}/${details.source}` : daCtx.org;
  const dest = `${daCtx.org}/${details.destination}`;
  const obj = await env.DA_CONTENT.head(src);
  // Head won't return for a folder so this must be a file copy.
  if (obj) {
    await copyFile(env, daCtx, src, dest, isRename).then((value) => results.push(value));
  } else {
    let cursor;
    // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
    // Which means the list will only pickup children. This adds to the initial list.
    const detailsList = [{ src: `${src}.props`, dest: `${dest}.props` }];
    do {
      const input = {
        prefix: `${src}/`,
        limit,
        cursor,
      };
      const r2list = await env.DA_CONTENT.list(input);
      const { objects } = r2list;
      cursor = r2list.cursor;
      // List of objects to copy
      detailsList.push(...objects
        // Do not save root props file to new folder under *original*
        .filter(({ key }) => key !== `${src}.props`)
        .map(({ key }) => ({ src: key, dest: `${key.replace(src, dest)}` })));
    } while (cursor);
    await copyFiles(env, daCtx, detailsList, isRename).then((values) => results.push(...values));
  }

  // Retry failures
  const retries = results.filter(({ success }) => !success).map(({ source, destination }) => ({ src: source, dest: destination }));
  if (retries.length > 0) {
    const retryResults = await copyFiles(env, daCtx, retries, isRename);
    results.push(...retryResults);
  }

  return { status: 204 };
}
