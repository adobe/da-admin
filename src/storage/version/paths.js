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
 * Prefix matching all audit files (audit.txt + audit-*.txt + per-entry objects under audit/).
 * @param {string} repo
 * @param {string} fileId
 * @returns {string} prefix (repo/.da-versions/fileId/audit)
 */
export function auditDirPrefix(repo, fileId) {
  return `${repo}/.da-versions/${fileId}/audit`;
}

/**
 * Per-entry audit object key (append-only ledger). Each audit entry is one S3 object
 * under {repo}/.da-versions/{fileId}/audit/, eliminating read-modify-write contention on
 * audit.txt. Uses {ts}-{rand} so concurrent writers at the same millisecond cannot collide.
 * @param {string} repo
 * @param {string} fileId
 * @param {string|number} timestamp - entry timestamp (ms)
 * @param {string} rand - random suffix for uniqueness
 * @returns {string} key (repo/.da-versions/fileId/audit/{ts}-{rand}.txt)
 */
export function auditEntryKey(repo, fileId, timestamp, rand) {
  return `${repo}/.da-versions/${fileId}/audit/${timestamp}-${rand}.txt`;
}
