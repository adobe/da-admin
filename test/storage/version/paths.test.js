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
import {
  versionKey,
  auditKey,
  auditArchiveKey,
  auditDirPrefix,
  auditUserKey,
  auditUserArchiveKey,
} from '../../../src/storage/version/paths.js';

describe('Version Paths', () => {
  describe('versionKey', () => {
    it('returns repo-scoped path under .da-versions', () => {
      const key = versionKey('myrepo', 'file-id-123', 'v-uuid', 'html');
      assert.strictEqual(key, 'myrepo/.da-versions/file-id-123/v-uuid.html');
    });

    it('handles different extensions', () => {
      assert.strictEqual(versionKey('r', 'fid', 'vid', 'mp4'), 'r/.da-versions/fid/vid.mp4');
      assert.strictEqual(versionKey('r', 'fid', 'vid', 'png'), 'r/.da-versions/fid/vid.png');
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

  describe('auditArchiveKey', () => {
    it('returns timestamped archive path under .da-versions', () => {
      const key = auditArchiveKey('myrepo', 'file-id-xyz', 1234567890);
      assert.strictEqual(key, 'myrepo/.da-versions/file-id-xyz/audit-1234567890.txt');
    });

    it('uses string timestamp as-is', () => {
      assert.strictEqual(
        auditArchiveKey('r', 'fid', '9999'),
        'r/.da-versions/fid/audit-9999.txt',
      );
    });
  });

  describe('auditDirPrefix', () => {
    it('returns prefix that matches audit.txt, audit-*.txt, and per-user audit-{hash}.txt files', () => {
      const prefix = auditDirPrefix('myrepo', 'file-id-xyz');
      assert.strictEqual(prefix, 'myrepo/.da-versions/file-id-xyz/audit');
    });
  });

  describe('auditUserKey', () => {
    it('returns per-user audit shard key under .da-versions', () => {
      const key = auditUserKey('myrepo', 'file-id-xyz', 'deadbeefcafef00d');
      assert.strictEqual(key, 'myrepo/.da-versions/file-id-xyz/audit-deadbeefcafef00d.txt');
    });

    it('lives under the same prefix as auditDirPrefix so ListObjectsV2 picks it up', () => {
      const repo = 'r';
      const fileId = 'f';
      const prefix = auditDirPrefix(repo, fileId);
      assert.ok(auditUserKey(repo, fileId, 'anon').startsWith(prefix));
    });
  });

  describe('auditUserArchiveKey', () => {
    it('returns per-user archive key with timestamp suffix', () => {
      const key = auditUserArchiveKey('myrepo', 'fid', 'abc1234567890def', 1234567890);
      assert.strictEqual(key, 'myrepo/.da-versions/fid/audit-abc1234567890def-1234567890.txt');
    });

    it('matches the audit prefix (read merges it transparently)', () => {
      const prefix = auditDirPrefix('r', 'f');
      assert.ok(auditUserArchiveKey('r', 'f', 'anon', '9999').startsWith(prefix));
    });
  });
});
