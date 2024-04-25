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
import listObjects from '../object/list.js';
import putObject from '../object/put.js';

export async function patchObjectVersion(req, env, daCtx) {
  const { org, key } = daCtx;
  const rb = await req.json();

  const current = await getObject(env, { org, key }, true);
  if (current.status === 404 || !current.metadata.id) {
    return 404;
  }
  const resp = await listObjects(env, { org, key: `.da-versions/${current.metadata.id}` });
  const json = JSON.parse(resp.body);

  for (const entry of json) {
    const entryURL = `/versionsource/${org}/${current.metadata.id}/${entry.name}.${entry.ext}`;
    if (entryURL === rb.url) {
      // Found the version entry that matches
      const versionObj = await getObject(env, {
        org,
        key: `.da-versions/${current.metadata.id}/${entry.name}.${entry.ext}`,
      }, true);

      // Update it with the display name (the only thing that can be patched)
      // and store it
      versionObj.metadata.displayName = rb.displayName;
      return putObject(env, daCtx, versionObj);
    }
  }

  return 404;
}
