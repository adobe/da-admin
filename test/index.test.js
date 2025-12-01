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
import handler from '../src/index.js';

describe('fetch', () => {
  it('should be callable', () => {
    assert(handler.fetch);
  });

  it('should return a response object for options', async () => {
    const resp = await handler.fetch({ method: 'OPTIONS' }, {});
    assert.strictEqual(resp.status, 204);
  });

  it('should return a response object for unknown', async () => {
    const resp = await handler.fetch({ url: 'https://www.example.com', method: 'BLAH' }, {});
    assert.strictEqual(resp.status, 400);
  });

  it('should return 401 when not authorized and not logged in', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({ authorized: false, users: [{ email: 'anonymous' }] }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 401);
  });

  it('should return 403 when logged in but not authorized', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({ authorized: false, users: [{ email: 'joe@bloggs.org' }] }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 403);
  });
});

describe('invalid routes', () => {
  const fetchStatus = async (path, method) => {
    const resp = await handler.fetch({ method, url: `http://www.sample.com${path}` }, {});
    return resp.status;
  };

  const test = async (path, status) => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    for (const method of methods) {
      // eslint-disable-next-line no-await-in-loop
      const s = await fetchStatus(path, method);
      assert.strictEqual(s, status);
    }
  };

  it('return 400 for invalid paths', async () => {
    await test('/', 400);
    await test('/source/owner', 400);
    await test('/source//owner/repo/path/file.html', 400);
    await test('/source/owner//repo/path/file.html', 400);
    await test('/source/owner/repo//path/file.html', 400);
    await test('/source/owner/repo/path//file.html', 400);
  });

  it('return 404 for unknown paths', async () => {
    await test('/unknown/owner/repo/path/file.html', 404);
  });

  it('return 405 for unknown methods', async () => {
    const status = await fetchStatus('/source/owner/repo/path/file.html', 'BLAH');
    assert.strictEqual(status, 405);
  });
});
