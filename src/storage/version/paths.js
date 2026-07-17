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

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the value is a plain UUID that is safe to use as a file id.
 * A file id becomes a path segment inside the reserved .da-versions key space,
 * so it must not contain a slash or any other key steering characters. Requiring
 * the UUID shape also matches the ids this service generates with
 * crypto.randomUUID.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/**
 * True when the value is safe to use as a path segment inside the reserved
 * .da-versions key space. A stored file id read from object metadata is
 * untrusted input, so it must not steer keys. The Cloudflare Worker AWS
 * transport turns a key into a WHATWG URL, which collapses "." and ".."
 * segments, treats a backslash as a separator, decodes "%xx" (so "%2e" becomes
 * "."), and strips whitespace such as tab or newline. Any of those let a
 * poisoned id escape its per-document prefix, so reject a slash, a backslash, a
 * percent sign, any whitespace, a "." or ".." segment, and a bare .da-versions
 * segment before key construction. A plain single-segment id, including a UUID
 * or a benign legacy id, is still allowed. It is weaker than isValidId on
 * purpose so existing non-UUID ids keep working while unsafe values are refused.
 * @param {string} id
 * @returns {boolean}
 */
export function isSafeId(id) {
  return typeof id === 'string'
    && id.length > 0
    && !/[\s%/\\]/.test(id)
    && id !== '.'
    && id !== '..'
    && id !== '.da-versions';
}

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
