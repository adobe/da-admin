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
import esmock from 'esmock';

describe('Version List', () => {
  it('should return 404 when current object does not exist', async () => {
    const mockGetObject = async () => ({ status: 404, metadata: {} });
    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });
    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'repo/file.html' });
    assert.strictEqual(result, 404);
  });

  it('should return 404 when current object has no id', async () => {
    const mockGetObject = async () => ({ status: 200, metadata: {} });
    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });
    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'repo/file.html' });
    assert.strictEqual(result, 404);
  });

  it('should return 404 when key has no repo prefix', async () => {
    const mockGetObject = async () => ({ status: 200, metadata: { id: 'test-id' } });
    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });
    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'file.html' });
    assert.strictEqual(result, 404);
  });

  describe('audit file mode', () => {
    it('returns audit entries sorted by timestamp', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'myrepo/docs/file.html') {
          return { status: 200, metadata: { id: 'file-id-flag' } };
        }
        return { status: 404 };
      };

      const mockReadAuditLines = async () => [
        { timestamp: 3000, users: [{ email: 'u@x.com' }], path: '/docs/file.html' },
        { timestamp: 5000, users: [{ email: 'u@x.com' }], path: '/docs/file.html' },
        { timestamp: 1000, users: [{ email: 'u@x.com' }], path: '/docs/file.html' },
      ];

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'bkt', org: 'testorg', key: 'myrepo/docs/file.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 3);
      assert.strictEqual(versions[0].timestamp, 5000, 'most recent entry first');
      assert.strictEqual(versions[2].timestamp, 1000, 'oldest entry last');
    });

    it('empty audit returns []', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'repo/path.html') {
          return { status: 200, metadata: { id: 'id-no-legacy' } };
        }
        return { status: 404 };
      };

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/version/audit.js': { readAuditLines: async () => [] },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'bkt', org: 'testorg', key: 'repo/path.html' },
      );

      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.body, '[]');
    });

    it('readAuditLines throws: falls back to empty audit entries and proceeds', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'repo/doc.html') {
          return { status: 200, metadata: { id: 'fid-throw' } };
        }
        return { status: 404 };
      };

      const mockReadAuditLines = async () => {
        throw new Error('S3 unreachable');
      };

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'b', org: 'testorg', key: 'repo/doc.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 0, 'audit error must be swallowed, result is empty');
    });

    it('includes URL and label for version entries with versionId', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'r/doc.html') {
          return { status: 200, metadata: { id: 'fid' } };
        }
        return { status: 404 };
      };
      const mockReadAuditLines = async () => [
        {
          timestamp: 100,
          users: [{ email: 'a@b.com' }],
          path: '/doc.html',
          versionLabel: 'v1',
          versionId: 'uuid-1',
        },
      ];

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'b', org: 'acme', key: 'r/doc.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].url, '/versionsource/acme/r/fid/uuid-1.html');
      assert.strictEqual(versions[0].label, 'v1');
    });

    it('caps audit entries at MAX_VERSIONS (500) when more exist across archives', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'myrepo/doc.html') {
          return { status: 200, metadata: { id: 'fid-cap' } };
        }
        return { status: 404 };
      };

      const mockReadAuditLines = async () => Array.from({ length: 600 }, (_, i) => ({
        timestamp: i + 1,
        users: [{ email: 'u@x.com' }],
        path: '/doc.html',
      }));

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'b', org: 'testorg', key: 'myrepo/doc.html' },
      );

      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 500, 'result must be capped at MAX_VERSIONS (500)');
      assert.strictEqual(versions[0].timestamp, 600, 'most recent entry first');
      assert.strictEqual(versions[499].timestamp, 101, 'oldest included entry');
    });
  });
});
