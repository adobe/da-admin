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
import { copyFile } from '../utils/copy.js';
import { deleteObject } from './delete.js';

const limit = 100;

/**
 * Moves a directory (and contents) or a single file to new location.
 * @param {Object} env the CloudFlare environment
 * @param {Object} daCtx the DA Context
 * @param {Object} details the source & details of the copy operation
 * @param {string} details.source the source directory or file
 * @param {string} details.destination the destination directory or file
 * @return {Promise<{ status }>}
 */
export default async function moveObject(env, daCtx, details) {
  if (daCtx.isFile) {
    const res = await copyFile(env, daCtx, details.source, details.destination, true);
    if (res.success) {
      await deleteObject(env, daCtx, details.source, true);
    }
    return { status: 204 };
  }

  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const sourceList = [{ src: `${details.source}.props`, dest: `${details.destination}.props` }];
  const results = []; // Keep this?
  let cursor;
  const prefix = details.source.length ? `${daCtx.org}/${details.source}/` : `${daCtx.org}/`;
  do {
    try {
      const input = {
        prefix,
        limit,
        cursor,
      };
      const r2list = await env.DA_CONTENT.list(input);
      const { objects } = r2list;
      cursor = r2list.cursor;

      sourceList.push(...objects
        .map(({ key }) => {
          const src = key.split('/').slice(1).join('/');
          return {
            src,
            dest: src.replace(details.source, details.destination),
          };
        }));

      const promises = [];
      sourceList.forEach(({ src, dest }) => {
        promises.push(
          copyFile(env, daCtx, src, dest, true)
            .then(async (res) => {
              if (res.success) {
                await deleteObject(env, daCtx, src, true);
              }
              return res;
            })
            .then((res) => results.push(res)),
        );
      });
      await Promise.allSettled(promises);
      sourceList.length = 0;
      /* c8 ignore next 3 */
    } catch (e) {
      return { body: '', status: 404 };
    }
  } while (cursor);

  return { status: 204 };
}
