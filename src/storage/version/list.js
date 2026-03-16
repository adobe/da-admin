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
import processQueue from '@adobe/helix-shared-process-queue';
import getObject from '../object/get.js';
import listObjects from '../object/list.js';
import { readAuditLines } from './audit.js';

const MAX_VERSIONS = 500;
const CONCURRENCY = 50;

/**
 * Try new structure: repo/.da-versions/fileId/ (snapshots) + audit.txt. Merge and sort.
 * @returns {Promise<{ status: number, body?: string, contentType?: string }|null>} null = fallback
 */
async function listFromNewStructure(env, { bucket, org, key }, fileId, repo) {
  const ext = (key && key.includes('.')) ? key.split('.').pop() : 'html';
  const listResp = await listObjects(env, {
    bucket,
    org,
    key: `${repo}/.da-versions/${fileId}`,
  }, MAX_VERSIONS);
  if (listResp.status !== 200) {
    return null;
  }

  const list = JSON.parse(listResp.body);
  const snapshotEntries = list.filter((e) => !(e.name === 'audit' && e.ext === 'txt'));

  const snapshotVersions = await processQueue(snapshotEntries, async (entry) => {
    const entryResp = await getObject(env, {
      bucket,
      org,
      key: `${repo}/.da-versions/${fileId}/${entry.name}.${entry.ext}`,
    }, true);

    if (entryResp.status !== 200 || !entryResp.metadata) {
      return undefined;
    }

    const timestamp = parseInt(entryResp.metadata.timestamp || '0', 10);
    const users = JSON.parse(entryResp.metadata.users || '[{"email":"anonymous"}]');
    const { label, path } = entryResp.metadata;

    return {
      url: `/versionsource/${org}/${repo}/${fileId}/${entry.name}.${entry.ext}`,
      users,
      timestamp,
      path,
      label: label ?? undefined,
    };
  }, CONCURRENCY);

  let auditEntries = [];
  try {
    const lines = await readAuditLines(env, { bucket, org }, repo, fileId);
    auditEntries = lines.map(({
      users, timestamp, path, versionLabel, versionId,
    }) => {
      const pathFull = (repo && path && path.startsWith('/')) ? repo + path : path;
      const entry = { users, timestamp, path: pathFull };
      if (versionLabel) entry.versionLabel = versionLabel;
      if (versionId) entry.versionId = ext ? `${versionId}.${ext}` : versionId;
      return entry;
    });
  } catch {
    // Ignore audit read errors (e.g. 404)
  }

  const merged = [...snapshotVersions.filter(Boolean), ...auditEntries];
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    status: 200,
    contentType: listResp.contentType,
    body: JSON.stringify(merged),
  };
}

/**
 * Legacy: list org/.da-versions/fileId/, HEAD each, return list (empty = audit entries).
 * Kept during migration; will be removed when all orgs use the new structure.
 */
async function listFromLegacyStructure(env, { bucket, org, key: _ }, fileId) {
  const resp = await listObjects(env, { bucket, org, key: `.da-versions/${fileId}` }, MAX_VERSIONS);
  if (resp.status !== 200) {
    return resp;
  }
  const list = JSON.parse(resp.body);

  const versions = await processQueue(list, async (entry) => {
    const entryResp = await getObject(env, {
      bucket,
      org,
      key: `.da-versions/${fileId}/${entry.name}.${entry.ext}`,
    }, true);

    if (entryResp.status !== 200 || !entryResp.metadata) {
      return undefined;
    }

    const timestamp = parseInt(entryResp.metadata.timestamp || '0', 10);
    const users = JSON.parse(entryResp.metadata.users || '[{"email":"anonymous"}]');
    const { label, path } = entryResp.metadata;

    if (entryResp.contentLength > 0) {
      return {
        url: `/versionsource/${org}/${fileId}/${entry.name}.${entry.ext}`,
        users,
        timestamp,
        path,
        label,
      };
    }
    return { users, timestamp, path };
  }, CONCURRENCY);

  const filteredVersions = versions.filter((v) => v !== undefined);

  return {
    status: resp.status,
    contentType: resp.contentType,
    body: JSON.stringify(filteredVersions),
  };
}

/**
 * Backward compat: merge legacy (org/.da-versions/fileId) with new (repo/.da-versions/fileId)
 * when new path has no snapshots yet. When new path has snapshots (file already migrated),
 * use new only to avoid duplicates while legacy may still exist (cleanup later).
 */
function mergeLegacyAndNewResult(legacyResult, newResult) {
  if (legacyResult.status !== 200 || !legacyResult.body) return newResult;
  const legacyEntries = JSON.parse(legacyResult.body);
  const newEntries = JSON.parse(newResult.body);
  const merged = [...legacyEntries, ...newEntries];
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return {
    status: 200,
    contentType: newResult.contentType || legacyResult.contentType,
    body: JSON.stringify(merged),
  };
}

export async function listObjectVersions(env, { bucket, org, key }) {
  const current = await getObject(env, { bucket, org, key }, true);
  if (current.status === 404 || !current.metadata.id) {
    return 404;
  }

  const fileId = current.metadata.id;
  const repo = key.includes('/') ? key.split('/')[0] : '';

  if (repo) {
    const newResult = await listFromNewStructure(env, { bucket, org, key }, fileId, repo);
    if (newResult) {
      const newEntries = JSON.parse(newResult.body);
      const hasSnapshotsInNew = newEntries.some((e) => e.url);
      if (hasSnapshotsInNew) {
        return newResult;
      }
      const legacyResult = await listFromLegacyStructure(env, { bucket, org, key }, fileId);
      return mergeLegacyAndNewResult(legacyResult, newResult);
    }
  }

  return listFromLegacyStructure(env, { bucket, org, key }, fileId);
}
