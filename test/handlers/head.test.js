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

describe('Head Route', () => {
  it('returns 404 with no content length', async () => {
    const headHandler = (await import('../../src/handlers/head.js')).default;
    const daCtx = { path: '/favicon.ico' };
    const resp = await headHandler({ env: {}, daCtx });
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.contentLength, 0);
  });

  it('returns 403 without crashing when HEAD /list has no read permission', async () => {
    const getList = async () => ({ status: 403 });
    const headHandler = await esmock('../../src/handlers/head.js', {
      '../../src/routes/list.js': { default: getList },
    });

    const daCtx = { path: '/list/foo/bar' };
    const resp = await headHandler({ env: {}, daCtx });
    assert.strictEqual(resp.status, 403);
    assert.strictEqual(resp.contentLength, 0);
  });

  it('returns 403 without crashing when HEAD /versionlist has no read permission', async () => {
    const getVersionList = async () => ({ status: 403 });
    const headHandler = await esmock('../../src/handlers/head.js', {
      '../../src/routes/version.js': { getVersionList },
    });

    const daCtx = { path: '/versionlist/foo/bar' };
    const resp = await headHandler({ env: {}, daCtx });
    assert.strictEqual(resp.status, 403);
    assert.strictEqual(resp.contentLength, 0);
  });

  it('returns contentLength for a successful HEAD /list', async () => {
    const getList = async () => ({ status: 200, body: '[{"foo":"bar"}]', contentType: 'application/json' });
    const headHandler = await esmock('../../src/handlers/head.js', {
      '../../src/routes/list.js': { default: getList },
    });

    const daCtx = { path: '/list/foo/bar' };
    const resp = await headHandler({ env: {}, daCtx });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.contentLength, 15);
  });
});
