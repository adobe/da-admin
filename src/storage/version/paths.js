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
 * New structure: versions live under repo. Path for a version object.
 * @param {string} repo
 * @param {string} fileId
 * @param {string} versionId
 * @param {string} ext
 * @returns {string} key (repo/.da-versions/fileId/versionId.ext)
 */
export function versionKeyNew(repo, fileId, versionId, ext) {
  return `${repo}/.da-versions/${fileId}/${versionId}.${ext}`;
}

/**
 * Legacy structure: versions at org root. Path for a version object.
 * @param {string} fileId
 * @param {string} versionId
 * @param {string} ext
 * @returns {string} key (.da-versions/fileId/versionId.ext)
 */
export function versionKeyLegacy(fileId, versionId, ext) {
  return `.da-versions/${fileId}/${versionId}.${ext}`;
}

/**
 * Legacy structure: listing prefix for all versions of a file.
 * @param {string} fileId
 * @returns {string} key (.da-versions/fileId)
 */
export function versionPrefixLegacy(fileId) {
  return `.da-versions/${fileId}`;
}

/**
 * New structure: audit file path for a file (under repo).
 * @param {string} repo
 * @param {string} fileId
 * @returns {string} key (repo/.da-versions/fileId/audit.txt)
 */
export function auditKey(repo, fileId) {
  return `${repo}/.da-versions/${fileId}/audit.txt`;
}
