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

describe('getObjectVersion', () => {
  it('returns new-path result when key has 3+ parts and new path succeeds', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (env, { key }) => {
      getObjectCalls.push(key);
      return { status: 200, body: 'content', contentType: 'text/html' };
    };

    const { getObjectVersion } = await esmock('../../../src/storage/version/get.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });

    const result = await getObjectVersion({}, { bucket: 'bkt', org: 'org1', key: 'myrepo/file-id/v-uuid.html' });

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, 'content');
    assert.strictEqual(getObjectCalls.length, 1, 'only new path tried');
    assert.ok(getObjectCalls[0].includes('myrepo/.da-versions/'), 'new path uses repo prefix');
    assert.ok(getObjectCalls[0].includes('file-id'), 'new path includes fileId');
    assert.ok(getObjectCalls[0].includes('v-uuid.html'), 'new path includes version file');
  });

  it('returns 404 when key has fewer than 3 parts', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (env, { key }) => {
      getObjectCalls.push(key);
      return { status: 200, body: 'content' };
    };

    const { getObjectVersion } = await esmock('../../../src/storage/version/get.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });

    const result = await getObjectVersion({}, { bucket: 'bkt', org: 'org1', key: 'file-id/v1.html' });

    assert.strictEqual(result.status, 404);
    assert.strictEqual(getObjectCalls.length, 0, 'no object fetch for short key');
  });

  it('passes head and conditionalHeaders to getObject', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (env, ctx, head, conditionalHeaders) => {
      getObjectCalls.push({ key: ctx.key, head, conditionalHeaders });
      return { status: 200 };
    };

    const { getObjectVersion } = await esmock('../../../src/storage/version/get.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });

    const headers = { 'if-none-match': 'etag-abc' };
    await getObjectVersion({}, { bucket: 'b', org: 'o', key: 'repo/fid/vid.html' }, true, headers);

    assert.strictEqual(getObjectCalls[0].head, true);
    assert.deepStrictEqual(getObjectCalls[0].conditionalHeaders, headers);
  });

  it('returns 404 when version is not found', async () => {
    const mockGetObject = async () => ({ status: 404 });

    const { getObjectVersion } = await esmock('../../../src/storage/version/get.js', {
      '../../../src/storage/object/get.js': { default: mockGetObject },
    });

    const result = await getObjectVersion({}, { bucket: 'b', org: 'o', key: 'r/f/v.html' });
    assert.strictEqual(result.status, 404);
  });
});
