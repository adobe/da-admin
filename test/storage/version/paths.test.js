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
import assert from 'node:assert';
import { versionKeyNew, versionKeyLegacy, auditKey } from '../../../src/storage/version/paths.js';

describe('Version Paths', () => {
  describe('versionKeyNew', () => {
    it('returns repo-scoped path under .da-versions', () => {
      const key = versionKeyNew('myorg', 'myrepo', 'file-id-123', 'v-uuid', 'html');
      assert.strictEqual(key, 'myrepo/.da-versions/file-id-123/v-uuid.html');
    });

    it('excludes org from the key', () => {
      const key = versionKeyNew('org1', 'repo1', 'fid', 'vid', 'json');
      assert.ok(!key.includes('org1'), 'org must not appear in new key');
      assert.strictEqual(key, 'repo1/.da-versions/fid/vid.json');
    });

    it('handles different extensions', () => {
      assert.strictEqual(versionKeyNew('o', 'r', 'fid', 'vid', 'mp4'), 'r/.da-versions/fid/vid.mp4');
      assert.strictEqual(versionKeyNew('o', 'r', 'fid', 'vid', 'png'), 'r/.da-versions/fid/vid.png');
    });
  });

  describe('versionKeyLegacy', () => {
    it('returns root-level .da-versions path', () => {
      const key = versionKeyLegacy('myorg', 'file-id-abc', 'v-uuid', 'html');
      assert.strictEqual(key, '.da-versions/file-id-abc/v-uuid.html');
    });

    it('excludes org from the legacy key', () => {
      const key = versionKeyLegacy('someorg', 'fid', 'vid', 'txt');
      assert.ok(!key.includes('someorg'), 'org must not appear in legacy key');
      assert.strictEqual(key, '.da-versions/fid/vid.txt');
    });
  });

  describe('auditKey', () => {
    it('returns repo-scoped audit.txt path', () => {
      const key = auditKey('myrepo', 'file-id-xyz');
      assert.strictEqual(key, 'myrepo/.da-versions/file-id-xyz/audit.txt');
    });

    it('uses the fileId in the path', () => {
      const key = auditKey('repo-a', 'id-42');
      assert.strictEqual(key, 'repo-a/.da-versions/id-42/audit.txt');
    });
  });
});
