/*
 * Copyright 2025 Adobe. All rights reserved.
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

const MAX_VERSIONS = 500;

export async function listObjectVersions(env, { bucket, org, key }) {
  const current = await getObject(env, { bucket, org, key }, true);
  if (current.status === 404 || !current.metadata.id) {
    return 404;
  }
  const resp = await listObjects(env, { bucket, org, key: `.da-versions/${current.metadata.id}` }, MAX_VERSIONS);
  if (resp.status !== 200) {
    return resp;
  }
  const list = JSON.parse(resp.body);
  // make 50 requests per batch to avoid overwhelming the system
  const batches = [];
  for (let i = 0; i < list.length; i += 50) {
    batches.push(list.slice(i, i + 50));
  }

  const versions = [];
  // Process batches sequentially to avoid .flat() which is not available in Workers
  for (const batch of batches) {
    // eslint-disable-next-line no-await-in-loop
    const batchResp = await Promise.all(batch.map(async (entry) => {
      const entryResp = await getObject(env, {
        bucket,
        org,
        key: `.da-versions/${current.metadata.id}/${entry.name}.${entry.ext}`,
      }, true);

      if (entryResp.status !== 200 || !entryResp.metadata) {
        // Some requests might fail for unknown reasons (system busy, etc.)
        return undefined;
      }

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

    // Filter out undefined entries and add to versions array
    versions.push(...batchResp.filter((version) => version !== undefined));
  }

  return {
    status: resp.status,
    contentType: resp.contentType,
    body: JSON.stringify(versions),
  };
}
