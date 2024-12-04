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

const MAX_KEYS = 100;

/**
 * Details of a Copy operation
 *
 * @typedef {Object} CopyDetails
 * @property {String} source the source directory or file
 * @property {String} destination the destination directory or file
 * @property {String} continuationToken the destination directory or file
 */

/**
 * Copies a directory (and contents) or a single file to location.
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA Context
 * @param {CopyDetails} details the source & details of the copy operation
 * @param {Boolean=false} isRename whether this is a rename operation
 * @return {Promise<{ status }>}
 */
export default async function copyObject(env, daCtx, details, isRename = false) {
  if (details.source === details.destination || details.source === '') {
    return { body: '', status: 409 };
  }

  if (daCtx.isFile) {
    await copyFile(env, daCtx, details.source, details.destination, isRename);
    return { status: 204 };
  }

  let copyDetailsList = [];
  let remainingKeys = [];
  let continuationToken;

  try {
    if (details.continuationToken) {
      continuationToken = details.continuationToken;
      remainingKeys = await env.DA_JOBS.get(continuationToken, { type: 'json' });
      copyDetailsList = remainingKeys.splice(0, MAX_KEYS).map((key) => {
        const src = key.split('/').slice(1).join('/');
        const dest = `${src.replace(details.source, details.destination)}`;
        return { src, dest };
      });
    } else {
      copyDetailsList.push({ src: `${details.source}.props`, dest: `${details.destination}.props` });
      const prefix = `${daCtx.org}/${details.source}/`;
      const input = {
        prefix,
        limit: MAX_KEYS,
      };
      let r2list = await env.DA_CONTENT.list(input);
      r2list.objects.forEach(({ key }) => {
        const src = key.split('/').slice(1).join('/');
        const dest = `${src.replace(details.source, details.destination)}`;
        copyDetailsList.push({ src, dest });
      });
      if (r2list.cursor) {
        continuationToken = `copy-${details.source}-${details.destination}-${crypto.randomUUID()}`;
        while (r2list.cursor) {
          input.cursor = r2list.cursor;
          r2list = await env.DA_CONTENT.list(input);
          remainingKeys.push(...r2list.objects);
        }
      }
    }
    await copyFiles(env, daCtx, copyDetailsList, isRename);

    if (remainingKeys.length) {
      await env.DA_JOBS.put(continuationToken, JSON.stringify(remainingKeys));
      return { body: JSON.stringify({ continuationToken }), status: 206 };
    } else if (continuationToken) {
      await env.DA_JOBS.delete(continuationToken);
    }
    return { status: 204 };
  } catch (e) {
    console.log(e);
    return { body: '', status: 404 };
  }
}
