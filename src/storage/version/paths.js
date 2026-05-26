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

/**
 * Path for a version object under repo.
 * @param {string} repo
 * @param {string} fileId
 * @param {string} versionId
 * @param {string} ext
 * @returns {string} key (repo/.da-versions/fileId/versionId.ext)
 */
export function versionKey(repo, fileId, versionId, ext) {
  return `${repo}/.da-versions/${fileId}/${versionId}.${ext}`;
}

/**
 * audit file path for a file (under repo).
 * @param {string} repo
 * @param {string} fileId
 * @returns {string} key (repo/.da-versions/fileId/audit.txt)
 */
export function auditKey(repo, fileId) {
  return `${repo}/.da-versions/${fileId}/audit.txt`;
}

/**
 * archive audit file path.
 * @param {string} repo
 * @param {string} fileId
 * @param {string|number} timestamp - last entry timestamp in the archived file
 * @returns {string} key (repo/.da-versions/fileId/audit-{timestamp}.txt)
 */
export function auditArchiveKey(repo, fileId, timestamp) {
  return `${repo}/.da-versions/${fileId}/audit-${timestamp}.txt`;
}

/**
 * Prefix that matches all audit files (audit.txt + audit-*.txt) for a file.
 * @param {string} repo
 * @param {string} fileId
 * @returns {string} prefix (repo/.da-versions/fileId/audit)
 */
export function auditDirPrefix(repo, fileId) {
  return `${repo}/.da-versions/${fileId}/audit`;
}

/**
 * Per-user audit file key. The audit ledger is sharded by hashed user identity so concurrent
 * writers from different users never collide on the same R2 key (no If-Match contention).
 * @param {string} repo
 * @param {string} fileId
 * @param {string} userHash - SHA-256-derived stable hash of the normalized users field
 * @returns {string} key (repo/.da-versions/fileId/audit-{userHash}.txt)
 */
export function auditUserKey(repo, fileId, userHash) {
  return `${repo}/.da-versions/${fileId}/audit-${userHash}.txt`;
}

/**
 * Per-user archive key — same shape as auditUserKey with a timestamp suffix so that per-user
 * audit rotation (AUDIT_MAX_ENTRIES) creates a sealed historical object next to the live one.
 * @param {string} repo
 * @param {string} fileId
 * @param {string} userHash
 * @param {string|number} timestamp - last entry timestamp in the archived file
 * @returns {string} key (repo/.da-versions/fileId/audit-{userHash}-{ts}.txt)
 */
export function auditUserArchiveKey(repo, fileId, userHash, timestamp) {
  return `${repo}/.da-versions/${fileId}/audit-${userHash}-${timestamp}.txt`;
}
