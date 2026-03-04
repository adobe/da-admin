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
});
