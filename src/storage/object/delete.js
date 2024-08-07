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

export default async function deleteObjects(env, daCtx) {
  const fullKey = `${daCtx.org}/${daCtx.key}`;
  const prefix = `${fullKey}/`;
  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const sourceKeys = [fullKey, `${fullKey}.props`];

  let truncated = false;
  do {
    const r2objects = await env.DA_CONTENT.list({ prefix, limit: 500 });
    const { objects } = r2objects;
    truncated = r2objects.truncated;
    sourceKeys.push(...objects.map(({ key }) => key));
    await env.DA_CONTENT.delete(sourceKeys);
  } while (truncated);
  return { body: null, status: 204 };
}
