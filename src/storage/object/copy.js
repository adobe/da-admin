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

import { copyFile, copyFiles } from '../utils/copy.js';

const limit = 100;

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
  if (details.source === details.destination || details.source === '') {
    return { body: '', status: 409 };
  }

  if (daCtx.isFile) {
    const resp = await copyFile(env, daCtx, details.source, details.destination, isRename);
    if (isRename && resp.success) {
      await env.DA_CONTENT.delete(`${daCtx.org}/${details.source}`);
    }
    return { status: 204 };
  }

  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const sourceList = [{ src: `${details.source}.props`, dest: `${details.destination}.props` }];
  const results = []; // Keep this?
  let cursor;
  const prefix = `${daCtx.org}/${details.source}/`;
  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  do {
    const input = {
      prefix,
      limit,
      cursor,
    };
    const r2list = await env.DA_CONTENT.list(input);
    const { objects } = r2list;
    cursor = r2list.cursor;
    // List of objects to copy
    sourceList.push(...objects
      .map(({ key }) => {
        const src = key.split('/').slice(1).join('/');
        return { src, dest: `${src.replace(details.source, details.destination)}` };
      }));
  } while (cursor);

  let idx = 0;
  while (results.length !== sourceList.length) {
    const files = sourceList.slice(idx, idx + limit);
    await copyFiles(env, daCtx, files, isRename).then(async (values) => {
      results.push(...values);
      if (isRename) {
        const successes = values
          .filter((item) => item.success)
          .map((item) => item.source);
        await env.DA_CONTENT.delete(successes);
      }
    });

    idx += limit;
  }
  return { status: 204 };
}
