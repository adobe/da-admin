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
import { versionKeyNew } from './paths.js';

/**
 * GET version: try new path (repo/.da-versions/fileId/versionId.ext) then legacy.
 * daCtx.key can be "repo/fileId/versionId.ext" or "fileId/versionId.ext".
 */
export async function getObjectVersion(env, { bucket, org, key }, head, conditionalHeaders) {
  const parts = key.split('/');
  if (parts.length >= 3) {
    const [repo, fileId, ...rest] = parts;
    const versionFile = rest.join('/');
    const ext = versionFile.split('.').pop();
    const versionId = versionFile.slice(0, -(ext.length + 1));
    const newKey = versionKeyNew(org, repo, fileId, versionId, ext);
    const resp = await getObject(env, { bucket, org, key: newKey }, head, conditionalHeaders);
    if (resp.status !== 404) {
      return resp;
    }
  }

  // Legacy path; kept during migration, will be removed when all orgs use new structure.
  const legacyKey = `.da-versions/${key}`;
  return getObject(env, { bucket, org, key: legacyKey }, head, conditionalHeaders);
}
