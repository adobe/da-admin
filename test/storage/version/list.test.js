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
/* eslint-disable no-unused-vars */
import assert from 'node:assert';
import esmock from 'esmock';

describe('Version List', () => {
  it('should return 404 when current object does not exist', async () => {
    const mockGetObject = async () => ({
      status: 404,
      metadata: {},
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'file.html' });
    assert.strictEqual(result, 404);
  });

  it('should return 404 when current object has no id', async () => {
    const mockGetObject = async () => ({
      status: 200,
      metadata: {},
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'file.html' });
    assert.strictEqual(result, 404);
  });

  it('should return error when list objects fails', async () => {
    const mockGetObject = async () => ({
      status: 200,
      metadata: { id: 'test-id-123' },
    });

    const mockListObjects = async () => ({
      status: 500,
      body: '[]',
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'file.html' });
    assert.strictEqual(result.status, 500);
  });

  it('should list versions with basic metadata', async () => {
    const mockGetObject = async (env, { key }, metadataOnly) => {
      if (key === 'file.html') {
        return {
          status: 200,
          metadata: { id: 'test-id-123' },
        };
      }
      // Version file
      return {
        status: 200,
        metadata: {
          timestamp: '1234567890',
          users: '[{"email":"user@example.com"}]',
          path: 'file.html',
        },
        contentLength: 0,
      };
    };

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify([
        { name: 'version-1', ext: 'html' },
      ]),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'org', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const versions = JSON.parse(result.body);
    assert.strictEqual(versions.length, 1);
    assert.deepStrictEqual(versions[0].users, [{ email: 'user@example.com' }]);
    assert.strictEqual(versions[0].timestamp, 1234567890);
    assert.strictEqual(versions[0].path, 'file.html');
    assert.strictEqual(versions[0].url, undefined); // No URL when contentLength is 0
  });

  it('should include URL when version has content', async () => {
    const mockGetObject = async (env, { key }, metadataOnly) => {
      if (key === 'file.html') {
        return {
          status: 200,
          metadata: { id: 'test-id-456' },
        };
      }
      // Version file with content
      return {
        status: 200,
        metadata: {
          timestamp: '1234567890',
          users: '[{"email":"user@example.com"}]',
          path: 'file.html',
          label: 'Important Version',
        },
        contentLength: 100,
      };
    };

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify([
        { name: 'version-2', ext: 'html' },
      ]),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const versions = JSON.parse(result.body);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].url, '/versionsource/testorg/test-id-456/version-2.html');
    assert.strictEqual(versions[0].label, 'Important Version');
  });

  it('should filter out failed version requests', async () => {
    let callCount = 0;
    const mockGetObject = async (env, { key }, metadataOnly) => {
      if (key === 'file.html') {
        return {
          status: 200,
          metadata: { id: 'test-id-789' },
        };
      }
      // Simulate some failures
      callCount += 1;
      if (callCount === 2) {
        // Second version request fails
        return {
          status: 500,
          metadata: undefined,
        };
      }
      return {
        status: 200,
        metadata: {
          timestamp: `123456789${callCount}`,
          users: '[{"email":"user@example.com"}]',
          path: 'file.html',
        },
        contentLength: 10,
      };
    };

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify([
        { name: 'version-1', ext: 'html' },
        { name: 'version-2', ext: 'html' },
        { name: 'version-3', ext: 'html' },
      ]),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const versions = JSON.parse(result.body);
    // Only 2 versions should be returned (version-2 failed)
    assert.strictEqual(versions.length, 2);
  });

  it('should handle batch processing for many versions', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (env, { key }, metadataOnly) => {
      if (key === 'file.html') {
        return {
          status: 200,
          metadata: { id: 'test-id-batch' },
        };
      }
      getObjectCalls.push(key);
      return {
        status: 200,
        metadata: {
          timestamp: '1234567890',
          users: '[{"email":"user@example.com"}]',
          path: 'file.html',
        },
        contentLength: 10,
      };
    };

    // Create 120 versions (should be processed in 3 batches of 50)
    const versions = [];
    for (let i = 0; i < 120; i += 1) {
      versions.push({ name: `version-${i}`, ext: 'html' });
    }

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify(versions),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const resultVersions = JSON.parse(result.body);
    // All 120 versions should be returned
    assert.strictEqual(resultVersions.length, 120);
    // Verify all version files were requested
    assert.strictEqual(getObjectCalls.length, 120);
  });

  it('should handle versions missing metadata fields gracefully', async () => {
    const mockGetObject = async (env, { key }, metadataOnly) => {
      if (key === 'file.html') {
        return {
          status: 200,
          metadata: { id: 'test-id-missing' },
        };
      }
      // Version with minimal metadata
      return {
        status: 200,
        metadata: {
          // timestamp missing
          // users missing
          // path missing
        },
        contentLength: 10,
      };
    };

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify([
        { name: 'version-1', ext: 'html' },
      ]),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const versions = JSON.parse(result.body);
    assert.strictEqual(versions.length, 1);
    // Should use defaults
    assert.strictEqual(versions[0].timestamp, 0);
    assert.deepStrictEqual(versions[0].users, [{ email: 'anonymous' }]);
    assert.strictEqual(versions[0].path, undefined);
  });

  it('should handle empty version list', async () => {
    const mockGetObject = async () => ({
      status: 200,
      metadata: { id: 'test-id-empty' },
    });

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify([]),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const versions = JSON.parse(result.body);
    assert.strictEqual(versions.length, 0);
  });

  it('should handle all versions failing', async () => {
    const mockGetObject = async (env, { key }, metadataOnly) => {
      if (key === 'file.html') {
        return {
          status: 200,
          metadata: { id: 'test-id-allfail' },
        };
      }
      // All version requests fail
      return {
        status: 404,
        metadata: undefined,
      };
    };

    const mockListObjects = async () => ({
      status: 200,
      body: JSON.stringify([
        { name: 'version-1', ext: 'html' },
        { name: 'version-2', ext: 'html' },
      ]),
    });

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    const result = await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });
    assert.strictEqual(result.status, 200);

    const versions = JSON.parse(result.body);
    // No versions should be returned
    assert.strictEqual(versions.length, 0);
  });

  it('should respect MAX_VERSIONS limit in list call', async () => {
    const mockGetObject = async () => ({
      status: 200,
      metadata: { id: 'test-id-limit' },
    });

    let maxVersionsParam = null;
    const mockListObjects = async (env, { key }, limit) => {
      maxVersionsParam = limit;
      return {
        status: 200,
        body: JSON.stringify([]),
      };
    };

    const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/object/list.js': {
        default: mockListObjects,
      },
    });

    await listObjectVersions({}, { bucket: 'test', org: 'testorg', key: 'file.html' });

    // Verify MAX_VERSIONS (500) is passed to listObjects
    assert.strictEqual(maxVersionsParam, 500);
  });

  describe('backward compat: not migrated but new audit entries in new path', () => {
    it('when new path has only audit.txt (no snapshots), legacy mode shows legacy snapshots only', async () => {
      const listObjectCalls = [];
      const getObjectCalls = [];
      const mockGetObject = async (env, { key }) => {
        getObjectCalls.push(key);
        if (key === 'myrepo/docs/file.html') {
          return { status: 200, metadata: { id: 'file-id-bcompat' } };
        }
        if (key === '.da-versions/file-id-bcompat/snap1.html') {
          return {
            status: 200,
            metadata: {
              timestamp: '1000',
              users: '[{"email":"legacy@example.com"}]',
              path: 'myrepo/docs/file.html',
              label: 'Legacy snapshot',
            },
            contentLength: 100,
          };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        listObjectCalls.push(key);
        if (key === '.da-versions/file-id-bcompat') {
          return {
            status: 200,
            body: JSON.stringify([{ name: 'snap1', ext: 'html' }]),
          };
        }
        return { status: 404, body: '[]' };
      };

      const newAuditLines = [
        { timestamp: 5000, users: [{ email: 'new@example.com' }], path: 'myrepo/docs/file.html' },
      ];
      const mockReadAuditLines = async () => newAuditLines;

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'bkt', org: 'testorg', key: 'myrepo/docs/file.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1, 'audit.txt not listed without VERSIONS_AUDIT_FILE_ORGS');
      assert.ok(versions[0].url);
      assert.strictEqual(versions[0].timestamp, 1000);
      assert.ok(listObjectCalls.some((k) => k.startsWith('.da-versions/')), 'legacy prefix listed for merge');
    });

    it('when new path list returns 404, uses legacy only', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'repo/path.html') {
          return { status: 200, metadata: { id: 'id-404' } };
        }
        if (key === '.da-versions/id-404/legacy1.html') {
          return {
            status: 200,
            metadata: { timestamp: '2000', users: '[]', path: 'repo/path.html' },
            contentLength: 50,
          };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        if (key === 'repo/.da-versions/id-404') {
          return { status: 404, body: '[]' };
        }
        if (key === '.da-versions/id-404') {
          return {
            status: 200,
            body: JSON.stringify([{ name: 'legacy1', ext: 'html' }]),
          };
        }
        return { status: 404 };
      };

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'bkt', org: 'testorg', key: 'repo/path.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1);
      assert.ok(versions[0].url);
    });

    it('without VERSIONS_AUDIT_FILE_ORGS, repo/.da-versions snapshots are not listed', async () => {
      const listKeys = [];
      const mockGetObject = async (env, { key }) => {
        if (key === 'repo/doc.html') {
          return { status: 200, metadata: { id: 'id-new' } };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        listKeys.push(key);
        if (key === '.da-versions/id-new') {
          return { status: 200, body: JSON.stringify([]) };
        }
        return { status: 404 };
      };

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'bkt', org: 'testorg', key: 'repo/doc.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 0);
      assert.ok(!listKeys.some((k) => k.includes('repo/.da-versions')));
    });
  });

  describe('VERSIONS_AUDIT_FILE_ORGS (new mode)', () => {
    it('audit file + SKIP_LEGACY: audit only, no org/.da-versions list', async () => {
      const listObjectCalls = [];
      const mockGetObject = async (env, { key }) => {
        if (key === 'myrepo/docs/file.html') {
          return { status: 200, metadata: { id: 'file-id-flag' } };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        listObjectCalls.push(key);
        return { status: 404, body: '[]' };
      };

      const newAuditLines = [
        { timestamp: 5000, users: [{ email: 'u@x.com' }], path: 'myrepo/docs/file.html' },
      ];
      const mockReadAuditLines = async () => newAuditLines;

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {
          VERSIONS_AUDIT_FILE_ORGS: 'testorg',
          VERSIONS_AUDIT_SKIP_LEGACY_ORGS: 'testorg',
        },
        { bucket: 'bkt', org: 'testorg', key: 'myrepo/docs/file.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].timestamp, 5000);
      assert.strictEqual(listObjectCalls.length, 0, 'skip legacy must not list org/.da-versions');
    });

    it('audit file + SKIP_LEGACY: empty audit returns []', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'repo/path.html') {
          return { status: 200, metadata: { id: 'id-no-legacy' } };
        }
        return { status: 404 };
      };

      const mockListObjects = async () => ({ status: 404, body: '[]' });
      const mockReadAuditLines = async () => [];

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {
          VERSIONS_AUDIT_FILE_ORGS: 'testorg',
          VERSIONS_AUDIT_SKIP_LEGACY_ORGS: 'testorg',
        },
        { bucket: 'bkt', org: 'testorg', key: 'repo/path.html' },
      );

      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.body, '[]');
    });

    it('audit file without skip: merges org/.da-versions with audit entries', async () => {
      const listObjectCalls = [];
      const mockGetObject = async (env, { key }) => {
        if (key === 'myrepo/docs/file.html') {
          return { status: 200, metadata: { id: 'fid-merge' } };
        }
        if (key === '.da-versions/fid-merge/leg.html') {
          return {
            status: 200,
            metadata: {
              timestamp: '1000',
              users: '[{"email":"leg@x.com"}]',
              path: 'myrepo/docs/file.html',
            },
            contentLength: 50,
          };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        listObjectCalls.push(key);
        if (key === '.da-versions/fid-merge') {
          return { status: 200, body: JSON.stringify([{ name: 'leg', ext: 'html' }]) };
        }
        return { status: 404, body: '[]' };
      };

      const mockReadAuditLines = async () => [
        { timestamp: 5000, users: [{ email: 'u@x.com' }], path: '/docs/file.html' },
      ];

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        { VERSIONS_AUDIT_FILE_ORGS: 'testorg' },
        { bucket: 'bkt', org: 'testorg', key: 'myrepo/docs/file.html' },
      );

      assert.ok(listObjectCalls.some((k) => k === '.da-versions/fid-merge'));
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 2);
    });

    it('audit file without skip: deduplicates entries with same timestamp as audit', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'myrepo/docs/file.html') {
          return { status: 200, metadata: { id: 'fid-dedup' } };
        }
        if (key === '.da-versions/fid-dedup/v1.html') {
          return {
            status: 200,
            metadata: {
              timestamp: '1000',
              users: '[{"email":"u@x.com"}]',
              path: 'myrepo/docs/file.html',
            },
            contentLength: 50,
          };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        if (key === '.da-versions/fid-dedup') {
          return { status: 200, body: JSON.stringify([{ name: 'v1', ext: 'html' }]) };
        }
        return { status: 404, body: '[]' };
      };

      // audit.txt has the same entry (timestamp 1000) — post-migration hybrid case
      const mockReadAuditLines = async () => [
        {
          timestamp: 1000, users: [{ email: 'u@x.com' }], path: '/docs/file.html', versionId: 'v1',
        },
      ];

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        { VERSIONS_AUDIT_FILE_ORGS: 'testorg' },
        { bucket: 'bkt', org: 'testorg', key: 'myrepo/docs/file.html' },
      );

      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1, 'duplicate entry (same timestamp) must appear only once');
      assert.strictEqual(versions[0].timestamp, 1000);
    });

    it('org not in new mode: merges legacy with new when new has no snapshots', async () => {
      const listObjectCalls = [];
      const mockGetObject = async (env, { key }) => {
        if (key === 'myrepo/docs/file.html') {
          return { status: 200, metadata: { id: 'file-id-true' } };
        }
        if (key === '.da-versions/file-id-true/snap1.html') {
          return {
            status: 200,
            metadata: {
              timestamp: '1000',
              users: '[{"email":"legacy@example.com"}]',
              path: 'myrepo/docs/file.html',
            },
            contentLength: 100,
          };
        }
        return { status: 404 };
      };

      const mockListObjects = async (env, { key }) => {
        listObjectCalls.push(key);
        if (key === 'myrepo/.da-versions/file-id-true') {
          return { status: 200, body: JSON.stringify([{ name: 'audit', ext: 'txt' }]) };
        }
        if (key === '.da-versions/file-id-true') {
          return { status: 200, body: JSON.stringify([{ name: 'snap1', ext: 'html' }]) };
        }
        return { status: 404, body: '[]' };
      };

      const mockReadAuditLines = async () => [
        { timestamp: 5000, users: [{ email: 'new@example.com' }], path: 'myrepo/docs/file.html' },
      ];

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {},
        { bucket: 'bkt', org: 'testorg', key: 'myrepo/docs/file.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1, 'new path has no snapshot files; legacy only');
      assert.ok(listObjectCalls.some((k) => k.startsWith('.da-versions/')));
    });

    it('readAuditLines throws: falls back to empty audit entries and proceeds', async () => {
      const mockGetObject = async (env, { key }) => {
        if (key === 'repo/doc.html') {
          return { status: 200, metadata: { id: 'fid-throw' } };
        }
        return { status: 404 };
      };

      const mockListObjects = async () => ({ status: 200, body: JSON.stringify([]) });
      const mockReadAuditLines = async () => {
        throw new Error('S3 unreachable');
      };

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        { VERSIONS_AUDIT_FILE_ORGS: 'testorg' },
        { bucket: 'b', org: 'testorg', key: 'repo/doc.html' },
      );

      assert.strictEqual(result.status, 200);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 0, 'audit error must be swallowed, result is empty');
    });

    it('audit file + skip legacy: audit lines, no legacy list', async () => {
      const listKeys = [];
      const mockGetObject = async (env, { key }) => {
        if (key === 'r/doc.html') {
          return { status: 200, metadata: { id: 'fid' } };
        }
        return { status: 404 };
      };
      const mockListObjects = async (env, { key }) => {
        listKeys.push(key);
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
        '../../../src/storage/object/list.js': { default: mockListObjects },
        '../../../src/storage/version/audit.js': { readAuditLines: mockReadAuditLines },
      });

      const result = await listObjectVersions(
        {
          VERSIONS_AUDIT_FILE_ORGS: 'acme',
          VERSIONS_AUDIT_SKIP_LEGACY_ORGS: 'acme',
        },
        { bucket: 'b', org: 'acme', key: 'r/doc.html' },
      );

      assert.strictEqual(result.status, 200);
      assert.strictEqual(listKeys.length, 0);
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].url, '/versionsource/acme/r/fid/uuid-1.html');
    });

    it('when org not in VERSIONS_AUDIT_FILE_ORGS, only org/.da-versions (not repo path)', async () => {
      const listKeys = [];
      const mockGetObject = async (env, { key }) => {
        if (key === 'r/doc.html') {
          return { status: 200, metadata: { id: 'fid2' } };
        }
        if (key === '.da-versions/fid2/leg.html') {
          return {
            status: 200,
            metadata: {
              timestamp: '50',
              users: '[{"email":"s@b.com"}]',
              path: 'r/doc.html',
            },
            contentLength: 10,
          };
        }
        return { status: 404 };
      };
      const mockListObjects = async (env, { key }) => {
        listKeys.push(key);
        if (key === '.da-versions/fid2') {
          return { status: 200, body: JSON.stringify([{ name: 'leg', ext: 'html' }]) };
        }
        return { status: 404 };
      };

      const { listObjectVersions } = await esmock('../../../src/storage/version/list.js', {
        '../../../src/storage/object/get.js': { default: mockGetObject },
        '../../../src/storage/object/list.js': { default: mockListObjects },
      });

      const result = await listObjectVersions(
        { VERSIONS_AUDIT_FILE_ORGS: 'other-org' },
        { bucket: 'b', org: 'acme', key: 'r/doc.html' },
      );

      assert.ok(listKeys.some((k) => k === '.da-versions/fid2'));
      assert.ok(!listKeys.some((k) => k.startsWith('r/')));
      const versions = JSON.parse(result.body);
      assert.strictEqual(versions.length, 1);
      assert.strictEqual(versions[0].url, '/versionsource/acme/fid2/leg.html');
    });
  });
});
