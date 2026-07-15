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
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({ authorized: true, users: [{ email: 'test@example.com' }], path: '/endpoint/repo/path/file.html' }),
      },
    });

    const resp = await hnd.fetch({ url: 'https://www.example.com/endpoint/repo/path/file.html', method: 'BLAH' }, {});
    assert.strictEqual(resp.status, 405);
  });

  it('should return 401 when user is anonymous', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({ authorized: false, users: [{ email: 'anonymous' }] }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 401);
  });

  it('should return 401 when not authorized and not logged in', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({ authorized: false, users: [{ email: 'test@example.com' }] }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 403);
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

  it('defers to the list route when not authorized on the exact path but api is list', async () => {
    // daCtx.authorized reflects exact-path permission only. A user who is only
    // granted access on a deep descendant (e.g. /folder2/a/b/c) has
    // authorized=false for the root listing request, but routes/list.js knows
    // how to fall back to descendant permission - so the blanket 403 gate here
    // must not shadow it for the list api.
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: false,
          users: [{ email: 'acapt@adobe.com' }],
          path: '/list/kptdobe',
          api: 'list',
          org: 'kptdobe',
          key: '',
        }),
      },
      '../src/handlers/get.js': {
        default: async () => ({ status: 200, body: '[]', contentType: 'application/json' }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET', url: 'http://www.example.com/list/kptdobe' }, {});
    assert.strictEqual(resp.status, 200);
  });

  it('still returns 403 for a non-list api when not authorized on the exact path', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: false,
          users: [{ email: 'acapt@adobe.com' }],
          path: '/source/kptdobe/test/index.html',
          api: 'source',
          org: 'kptdobe',
          key: 'test/index.html',
        }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET', url: 'http://www.example.com/source/kptdobe/test/index.html' }, {});
    assert.strictEqual(resp.status, 403);
  });

  it('return 404 for unknown get route', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({ authorized: true, users: [{ email: 'test@example.com' }], path: '/' }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET', url: 'http://www.example.com/' }, {});
    assert.strictEqual(resp.status, 404);
  });

  it('should return 500 when getDaCtx throws unexpected error', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => {
          throw new Error('Unexpected ctx error');
        },
      },
    });

    const resp = await hnd.fetch({ method: 'GET', url: 'http://www.example.com/source/org/repo/file.html' }, {});
    assert.strictEqual(resp.status, 500);
  });

  it('should expose continuation token header for list responses', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/list/org/repo/path',
          key: 'repo/path',
        }),
      },
      '../src/handlers/get.js': {
        default: async () => ({
          status: 200,
          body: '[]',
          contentType: 'application/json',
          continuationToken: 'next-token',
        }),
      },
    });

    const resp = await hnd.fetch({ method: 'GET', url: 'http://www.example.com/list/org/repo/path' }, {});
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.headers.get('da-continuation-token'), 'next-token');
  });
});

describe('.da-versions storage guard', () => {
  // Version and audit objects live at R2 key `{org}/{repo}/.da-versions/...`, so
  // daCtx.key (org stripped) is `{repo}/.da-versions/...`. The generic
  // source/list/delete routes must not reach that storage - only the ACL-aware
  // /versionsource and /versionlist routes may. When the guard is bypassed,
  // dispatch reaches the handler mocked below and leaks or alters the raw object.
  const leakHandler = { default: async () => ({ status: 200, body: 'SECRET VERSION BODY' }) };

  it('blocks reading a version object via the generic source route', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/source/org/repo/.da-versions/1234/5678.html',
          api: 'source',
          org: 'org',
          key: 'repo/.da-versions/1234/5678.html',
        }),
      },
      '../src/handlers/get.js': leakHandler,
    });

    const resp = await hnd.fetch(
      { method: 'GET', url: 'http://www.example.com/source/org/repo/.da-versions/1234/5678.html' },
      {},
    );
    assert.strictEqual(resp.status, 404);
  });

  it('blocks deleting a version object via the generic source route', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/source/org/repo/.da-versions/1234/5678.html',
          api: 'source',
          org: 'org',
          key: 'repo/.da-versions/1234/5678.html',
        }),
      },
      '../src/handlers/delete.js': leakHandler,
    });

    const resp = await hnd.fetch(
      { method: 'DELETE', url: 'http://www.example.com/source/org/repo/.da-versions/1234/5678.html' },
      {},
    );
    assert.strictEqual(resp.status, 404);
  });

  it('blocks listing the .da-versions folder via the generic list route', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/list/org/repo/.da-versions',
          api: 'list',
          org: 'org',
          key: 'repo/.da-versions',
        }),
      },
      '../src/handlers/get.js': leakHandler,
    });

    const resp = await hnd.fetch(
      { method: 'GET', url: 'http://www.example.com/list/org/repo/.da-versions' },
      {},
    );
    assert.strictEqual(resp.status, 404);
  });

  it('does not block the dedicated version route (no .da-versions in key)', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/versionsource/org/repo/1234/5678.html',
          api: 'versionsource',
          org: 'org',
          key: 'repo/1234/5678.html',
        }),
      },
      '../src/handlers/get.js': { default: async () => ({ status: 200, body: 'ok' }) },
    });

    const resp = await hnd.fetch(
      { method: 'GET', url: 'http://www.example.com/versionsource/org/repo/1234/5678.html' },
      {},
    );
    assert.strictEqual(resp.status, 200);
  });

  it('does not block ordinary content paths', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/source/org/repo/path/file.html',
          api: 'source',
          org: 'org',
          key: 'repo/path/file.html',
        }),
      },
      '../src/handlers/get.js': { default: async () => ({ status: 200, body: 'ok' }) },
    });

    const resp = await hnd.fetch(
      { method: 'GET', url: 'http://www.example.com/source/org/repo/path/file.html' },
      {},
    );
    assert.strictEqual(resp.status, 200);
  });

  it('blocks the legacy org-root .da-versions layout (first-segment key)', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/source/org/.da-versions/1234/5678.html',
          api: 'source',
          org: 'org',
          key: '.da-versions/1234/5678.html',
        }),
      },
      '../src/handlers/get.js': leakHandler,
    });

    const resp = await hnd.fetch(
      { method: 'GET', url: 'http://www.example.com/source/org/.da-versions/1234/5678.html' },
      {},
    );
    assert.strictEqual(resp.status, 404);
  });

  it('blocks writing an audit object via the generic source route', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/source/org/repo/.da-versions/1234/audit.txt',
          api: 'source',
          org: 'org',
          key: 'repo/.da-versions/1234/audit.txt',
        }),
      },
      '../src/handlers/post.js': leakHandler,
    });

    const resp = await hnd.fetch(
      { method: 'POST', url: 'http://www.example.com/source/org/repo/.da-versions/1234/audit.txt' },
      {},
    );
    assert.strictEqual(resp.status, 404);
  });

  it('does not block a path segment that merely contains da-versions', async () => {
    const hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async () => ({
          authorized: true,
          users: [{ email: 'test@example.com' }],
          path: '/source/org/repo/my-da-versions-notes/file.html',
          api: 'source',
          org: 'org',
          key: 'repo/my-da-versions-notes/file.html',
        }),
      },
      '../src/handlers/get.js': { default: async () => ({ status: 200, body: 'ok' }) },
    });

    const resp = await hnd.fetch(
      { method: 'GET', url: 'http://www.example.com/source/org/repo/my-da-versions-notes/file.html' },
      {},
    );
    assert.strictEqual(resp.status, 200);
  });
});

describe('invalid routes', () => {
  let hnd;

  before(async () => {
    hnd = await esmock('../src/index.js', {
      '../src/utils/daCtx.js': {
        default: async (req) => {
          const { pathname } = new URL(req.url);
          // For invalid paths, throw the error that getDaCtx would throw
          if (pathname.includes('//')) {
            throw new Error('Invalid path');
          }
          return {
            authorized: true,
            users: [{ email: 'test@example.com' }],
            path: pathname,
            api: 'source',
            org: 'owner',
            key: 'repo/path/file.html',
          };
        },
      },
    });
  });

  const fetchStatus = async (path, method) => {
    const resp = await hnd.fetch({ method, url: `http://www.sample.com${path}` }, {});
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
    await test('/source//org/repo/path/file.html', 400);
    await test('/source/org//repo/path/file.html', 400);
    await test('/source/org/repo//path/file.html', 400);
    await test('/source/org/repo/path//file.html', 400);
  });

  it('return 404 for unknown paths', async () => {
    await test('/unknown/owner/repo/path/file.html', 404);
  });

  it('return 405 for unknown methods', async () => {
    const status = await fetchStatus('/source/owner/repo/path/file.html', 'BLAH');
    assert.strictEqual(status, 405);
  });
});
