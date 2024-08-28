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
 * @typedef CopyResult
 * @property {Boolean} success whether the copy operation was successful
 * @property {String} source the fully qualified source key
 * @property {String} destination the fully qualified destination key
 */

/**
 * Copies the specified file from the source to the destination.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {String} sourceKey the key for the source file (excluding Org)
 * @param {String} destinationKey the key for the destination file (excluding Org)
 * @param {Boolean=false} retainMetadata whether to retain the metadata from the source
 * @return {Promise<CopyResult>} the status of the copy operation
 */
export const copyFile = async (env, daCtx, sourceKey, destinationKey, retainMetadata = false) => {
  const source = `${daCtx.org}/${sourceKey}`;
  const destination = `${daCtx.org}/${destinationKey}`;
  try {
    const obj = await env.DA_CONTENT.get(source);
    if (!obj) {
      return { success: false, source, destination };
    }

    const { httpMetadata } = obj;
    const body = await obj.text();
    // We want to keep the history if this was a rename. In case of an actual
    // copy we should start with clean history. The history is associated with the
    // ID of the object, so we need to generate a new ID for the object and also a
    // new ID for the version. We set the user to the user making the copy.
    const customMetadata = {
      id: crypto.randomUUID(),
      version: crypto.randomUUID(),
      timestamp: `${Date.now()}`,
      users: JSON.stringify(daCtx.users),
      path: destination,
    };
    if (retainMetadata) Object.assign(customMetadata, obj.customMetadata, { path: destination });

    await env.DA_CONTENT.put(destination, body, { httpMetadata, customMetadata });
    return { success: true, source, destination };
    /* c8 ignore next 5 */
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Failed to copy: ${source} to ${destination}`, e);
    return { success: false, source, destination };
  }
};

/**
 * @typedef CopyDetails
 * @type {Object}
 * @property {String} src the source key (excluding Org)
 * @property {String} dest the destination key (excluding Org)
 */

/**
 * Copies or Moves the specified files from the source to the destination.
 * Move operation retains source metadata and deletes source files on successful copy.
 *
 * @param {Object} env the CloudFlare environment
 * @param {DaCtx} daCtx the DA Context
 * @param {CopyDetails[]} detailsList the key for the source file
 * @param {Boolean=false} retainMetadata whether to retain the metadata from each source
 * @return {Promise<CopyResult[]>} the status of the copy operation
 */
export const copyFiles = async (env, daCtx, detailsList, retainMetadata = false) => {
  const promises = [];
  const copy = [...detailsList];
  while (copy.length > 0) {
    const { src, dest } = copy.shift();
    promises.push(copyFile(env, daCtx, src, dest, retainMetadata));
  }
  return Promise.all(promises);
};
