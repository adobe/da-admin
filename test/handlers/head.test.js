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

import headHandler from '../../src/handlers/head.js';

describe('Head Route', () => {
  it('Test favicon returns 404', async () => {
    const resp = await headHandler({ env: {}, daCtx: { path: '/favicon.ico' } });
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.contentLength, 0);
  });

  it('Test robots returns 200', async () => {
    const resp = await headHandler({ env: {}, daCtx: { path: '/robots.txt' } });
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.contentLength > 0);
  });

  it('Test /list forwarded status with body', async () => {
    const headHandlerWithMock = await esmock('../../src/handlers/head.js', {
      '../../src/routes/list.js': {
        default: async () => ({ body: '[]', contentType: 'application/json', status: 200 }),
      },
    });
    const resp = await headHandlerWithMock.default({
      env: {},
      daCtx: { path: '/list/org/repo' },
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.contentLength, 2);
  });

  it('Test /list 403 body-less does not crash', async () => {
    const headHandlerWithMock = await esmock('../../src/handlers/head.js', {
      '../../src/routes/list.js': {
        default: async () => ({ status: 403 }),
      },
    });
    const resp = await headHandlerWithMock.default({
      env: {},
      daCtx: { path: '/list/org/repo' },
    });
    assert.strictEqual(resp.status, 403);
    assert.strictEqual(resp.contentLength, 0);
  });

  it('Test /versionlist 403 body-less does not crash', async () => {
    const headHandlerWithMock = await esmock('../../src/handlers/head.js', {
      '../../src/routes/version.js': {
        getVersionList: async () => ({ status: 403 }),
        getVersionSource: async () => ({ status: 200 }),
      },
    });
    const resp = await headHandlerWithMock.default({
      env: {},
      daCtx: { path: '/versionlist/org/repo/file.html' },
    });
    assert.strictEqual(resp.status, 403);
    assert.strictEqual(resp.contentLength, 0);
  });

  it('Test unknown route returns undefined', async () => {
    const resp = await headHandler({ env: {}, daCtx: { path: '/unknown' } });
    assert.strictEqual(resp, undefined);
  });
});
