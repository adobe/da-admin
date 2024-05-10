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

export async function listObjectVersions(env, { org, key }) {
  const current = await getObject(env, { org, key }, true);
  if (current.status === 404 || !current.metadata.id) {
    return 404;
  }
  const resp = await listObjects(env, { org, key: `.da-versions/${current.metadata.id}` });
  const promises = await Promise.all(JSON.parse(resp.body).map(async (entry) => {
    const entryResp = await getObject(env, {
      org,
      key: `.da-versions/${current.metadata.id}/${entry.name}.${entry.ext}`,
    }, true);
    const timestamp = parseInt(entryResp.metadata.timestamp || '0', 10);
    const users = JSON.parse(entryResp.metadata.users || '[{"email":"anonymous"}]');
    const { label, path } = entryResp.metadata;

    if (entryResp.contentLength > 0) {
      return {
        url: `/versionsource/${org}/${current.metadata.id}/${entry.name}.${entry.ext}`,
        users,
        timestamp,
        path,
        label,
      };
    }
    return { users, timestamp, path };
  }));

  return {
    status: resp.status,
    contentType: resp.contentType,
    body: JSON.stringify(promises),
  };
}
