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
  isValidId,
  isSafeId,
  hasReservedSegment,
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
    it('returns prefix that matches audit.txt and audit-*.txt', () => {
      const prefix = auditDirPrefix('myrepo', 'file-id-xyz');
      assert.strictEqual(prefix, 'myrepo/.da-versions/file-id-xyz/audit');
    });
  });

  describe('isValidId', () => {
    it('accepts a plain UUID', () => {
      assert.strictEqual(isValidId('9b2e6c1a-4f3d-4a2b-8c1e-1d2f3a4b5c6d'), true);
    });

    it('rejects a non-UUID string', () => {
      assert.strictEqual(isValidId('not-a-uuid'), false);
    });

    it('rejects a UUID with a trailing path', () => {
      assert.strictEqual(isValidId('9b2e6c1a-4f3d-4a2b-8c1e-1d2f3a4b5c6d/x'), false);
    });

    it('rejects a non-string', () => {
      assert.strictEqual(isValidId(undefined), false);
    });
  });

  describe('isSafeId', () => {
    it('accepts a plain UUID', () => {
      assert.strictEqual(isSafeId('9b2e6c1a-4f3d-4a2b-8c1e-1d2f3a4b5c6d'), true);
    });

    it('accepts a benign legacy single-segment id', () => {
      assert.strictEqual(isSafeId('legacy-id-123'), true);
    });

    it('rejects an id with a slash', () => {
      assert.strictEqual(isSafeId('foo/bar'), false);
    });

    it('rejects an id with a .da-versions segment', () => {
      assert.strictEqual(isSafeId('x/.da-versions/y'), false);
    });

    it('rejects a bare .da-versions id', () => {
      assert.strictEqual(isSafeId('.da-versions'), false);
    });

    it('rejects a single dot segment', () => {
      assert.strictEqual(isSafeId('.'), false);
    });

    it('rejects a double dot segment', () => {
      assert.strictEqual(isSafeId('..'), false);
    });

    it('rejects an id with a backslash separator', () => {
      assert.strictEqual(isSafeId('..\\..'), false);
    });

    it('rejects a percent-encoded dot segment', () => {
      assert.strictEqual(isSafeId('%2e%2e'), false);
    });

    it('rejects an id with whitespace', () => {
      assert.strictEqual(isSafeId('a\tb'), false);
    });

    it('accepts a legacy id that contains a dot', () => {
      assert.strictEqual(isSafeId('v1.2'), true);
    });

    it('rejects an empty string', () => {
      assert.strictEqual(isSafeId(''), false);
    });

    it('rejects a non-string', () => {
      assert.strictEqual(isSafeId(null), false);
    });
  });

  describe('hasReservedSegment', () => {
    it('matches the reserved folder as any path segment', () => {
      assert.strictEqual(hasReservedSegment('repo/.da-versions/fid/audit.txt'), true);
      assert.strictEqual(hasReservedSegment('.da-versions/fid/v1.html'), true);
      assert.strictEqual(hasReservedSegment('a/b/.da-versions'), true);
    });

    it('does not match a segment that merely contains the name', () => {
      assert.strictEqual(hasReservedSegment('repo/my-da-versions-notes.html'), false);
      assert.strictEqual(hasReservedSegment('repo/.da-versions-backup/x'), false);
      assert.strictEqual(hasReservedSegment('repo/foo.da-versions'), false);
      assert.strictEqual(hasReservedSegment('repo/page1.html'), false);
    });

    it('is safe for non-string input', () => {
      assert.strictEqual(hasReservedSegment(undefined), false);
      assert.strictEqual(hasReservedSegment(null), false);
    });
  });
});
