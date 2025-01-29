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
import { deleteObject } from './delete.js';
import { copyFile } from './copy.js';
import { hasPermission } from '../../utils/auth.js';

const limit = 100;

export default async function moveObject(env, daCtx, details) {
  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const sourceKeys = [details.source];

  // Only add .props if the source is a folder
  // Note: this is not guaranteed to exist
  if (!daCtx.isFile) sourceKeys.push(`${details.source}.props`);

  const results = [];
  let ContinuationToken;
  const prefix = details.source.length ? `${daCtx.org}/${details.source}/` : `${daCtx.org}/`;
  do {
    try {
      const input = {
        prefix,
        limit,
        cursor: ContinuationToken,
      };
      const r2list = await env.DA_CONTENT.list(input);
      const { objects } = r2list;
      ContinuationToken = r2list.cursor;

      sourceKeys.push(...objects
        .map(({ key }) => key.split('/').slice(1).join('/')));

      const NextContinuationToken = r2list.cursor;

      const movedLoad = sourceKeys
        .filter((key) => hasPermission(daCtx, key, 'write'))
        .filter((key) => hasPermission(daCtx, key.replace(details.source, details.destination), 'write'))
        .map(async (key) => {
          const result = { key };
          const copied = await copyFile(env, daCtx, key, details, true);
          // Only delete the source if the file was successfully copied
          if (copied.$metadata.httpStatusCode === 200) {
            const deleted = await deleteObject(daCtx, key, env, true);
            result.status = deleted.status === 204 ? 204 : deleted.status;
          } else {
            result.status = copied.$metadata.httpStatusCode;
          }
          return result;
        });

      results.push(...await Promise.all(movedLoad));

      ContinuationToken = NextContinuationToken;
    } catch (e) {
      return { body: '', status: 404 };
    }
  } while (ContinuationToken);

  return { status: 204 };
}
