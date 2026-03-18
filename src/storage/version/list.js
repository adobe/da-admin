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

function orgListFromEnv(env, name) {
  const raw = env?.[name];
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Org uses audit.txt as the version list source (new feature). */
function orgUsesAuditFileList(env, org) {
  return orgListFromEnv(env, 'VERSIONS_AUDIT_FILE_ORGS').has(org);
}

/**
 * With audit-file feature: skip reading org/.da-versions (after migration).
 * Only applies when org is also in VERSIONS_AUDIT_FILE_ORGS.
 */
function orgSkipsLegacy(env, org) {
  return orgListFromEnv(env, 'VERSIONS_AUDIT_SKIP_LEGACY_ORGS').has(org);
}

function versionListModeLog(payload) {
  console.log('[versionlist]', JSON.stringify(payload));
}

function fileExt(key) {
  return (key && key.includes('.')) ? key.split('.').pop() : 'html';
}

/**
 * Build list entries from audit.txt lines.
 */
function buildEntriesFromAudit(lines, repo, org, fileId, ext) {
  return lines.map(({
    users, timestamp, path, versionLabel, versionId,
  }) => {
    const pathFull = (repo && path && path.startsWith('/')) ? repo + path : path;
    const entry = { users, timestamp, path: pathFull };
    if (versionLabel) entry.versionLabel = versionLabel;
    const versionIdWithExt = ext ? `${versionId}.${ext}` : versionId;
    if (versionId) {
      entry.versionId = versionIdWithExt;
      entry.url = `/versionsource/${org}/${repo}/${fileId}/${versionIdWithExt}`;
    }
    if (versionLabel) entry.label = versionLabel;
    return entry;
  });
}

/**
 * Legacy: list org/.da-versions/fileId/, HEAD each.
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

  if (repo && orgUsesAuditFileList(env, org)) {
    let auditLines = [];
    try {
      auditLines = await readAuditLines(env, { bucket, org }, repo, fileId);
    } catch {
      // no audit
    }
    const ext = fileExt(key);
    const auditEntries = buildEntriesFromAudit(auditLines, repo, org, fileId, ext);
    auditEntries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const auditResult = {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(auditEntries),
    };
    if (orgSkipsLegacy(env, org)) {
      versionListModeLog({
        mode: 'audit_file',
        org,
        key,
        fileId,
        legacy: 'skipped',
      });
      return auditResult;
    }
    const legacyResult = await listFromLegacyStructure(env, { bucket, org, key }, fileId);
    versionListModeLog({
      mode: 'audit_file',
      org,
      key,
      fileId,
      legacy: 'merged',
    });
    return mergeLegacyAndNewResult(legacyResult, auditResult);
  }

  versionListModeLog({
    mode: 'legacy',
    org,
    key,
    fileId,
    detail: 'org_root_da_versions_only',
  });
  return listFromLegacyStructure(env, { bucket, org, key }, fileId);
}
