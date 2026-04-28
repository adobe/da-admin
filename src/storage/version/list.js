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
import { readAuditLines } from './audit.js';

const MAX_VERSIONS = 500;

function fileExt(key) {
  return (key && key.includes('.')) ? key.split('.').pop() : 'html';
}

function buildEntriesFromAudit(lines, repo, org, fileId, ext) {
  return lines.map(({
    users, timestamp, path, versionLabel, versionId,
  }) => {
    const pathFull = (repo && path && path.startsWith('/')) ? repo + path : path;
    const entry = { users, timestamp, path: pathFull };
    if (versionLabel) entry.label = versionLabel;
    const versionIdWithExt = ext ? `${versionId}.${ext}` : versionId;
    if (versionId) {
      entry.versionId = versionIdWithExt;
      entry.url = `/versionsource/${org}/${repo}/${fileId}/${versionIdWithExt}`;
    }
    return entry;
  });
}

export async function listObjectVersions(env, { bucket, org, key }) {
  const current = await getObject(env, { bucket, org, key }, true);
  const repo = key.includes('/') ? key.split('/')[0] : '';

  if (current.status === 404 || !current.metadata.id || !repo) {
    return 404;
  }

  const fileId = current.metadata.id;
  let auditLines = [];
  try {
    auditLines = await readAuditLines(env, { bucket, org }, repo, fileId);
  } catch {
    // no audit
  }
  const ext = fileExt(key);
  const auditEntries = buildEntriesFromAudit(auditLines, repo, org, fileId, ext);
  auditEntries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  auditEntries.splice(MAX_VERSIONS);
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(auditEntries),
  };
}
