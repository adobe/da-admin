/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import assert from 'assert';
import esmock from 'esmock';

import { getAclCtx } from '../../src/utils/auth.js';

describe('Source Route', () => {
  it('Test invalidate using service binding', async () => {
    const sb_callbacks = [];
    const dacollab = {
      fetch: async (url) => sb_callbacks.push(url)
    };
    const env = {
      dacollab,
      DA_COLLAB: 'http://localhost:4444'
    };

    const daCtx = { aclCtx: { pathLookup: new Map() }};
    const putResp = async (e, c) => {
      if (e === env && c === daCtx) {
        return { status: 200 };
      }
    };

    const { postSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/put.js': {
          default: putResp
      }
    });

    const headers = new Map();
    headers.set('x-da-initiator', 'blah');

    const req = {
      headers,
      url: 'http://localhost:9876/source/somedoc.html'
    };

    const resp = await postSource({ req, env, daCtx });
    assert.equal(200, resp.status);
    assert.deepStrictEqual(['https://localhost/api/v1/syncadmin?doc=http://localhost:9876/source/somedoc.html'], sb_callbacks);
  });

  it('Test postSource from collab does not trigger invalidate callback', async () => {
    const { postSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/put.js': {
          default: async () => ({ status: 201 })
      }
    });

    const savedFetch = globalThis.fetch;
    try {
      const callbacks = [];
      globalThis.fetch = async (url) => {
        callbacks.push(url);
      };

      const headers = new Map();
      headers.set('content-type', 'text/html');
      headers.set('x-da-initiator', 'collab');

      const req = {
        headers,
        url: 'http://localhost:8787/source/a/b/mydoc.html'
      };

      const env = { DA_COLLAB: 'http://localhost:1234' };
      const daCtx = { aclCtx: { pathLookup: new Map() }};

      const resp = await postSource({ req, env, daCtx });
      assert.equal(201, resp.status);
      assert.equal(0, callbacks.length);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Test failing postSource does not trigger callback', async () => {
    const callbacks = [];
    const { postSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/put.js': {
          default: async () => ({ status: 500 })
      }
    });

    const savedFetch = globalThis.fetch;
    try {
      const callbacks = [];
      globalThis.fetch = async (url) => {
        callbacks.push(url);
      };

      const headers = new Map();
      headers.set('content-type', 'text/html');

      const req = {
        headers,
        url: 'http://localhost:8787/source/a/b/mydoc.html'
      };

      const env = { DA_COLLAB: 'http://localhost:1234' };
      const daCtx = { aclCtx: { pathLookup: new Map() }};

      const resp = await postSource({ req, env, daCtx });
      assert.equal(500, resp.status);
      assert.equal(0, callbacks.length);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Test getSource', async () => {
    const env = {};
    const daCtx = { aclCtx: { pathLookup: new Map() }};

    const called = [];
    const getResp = async (e, c) => {
      if (e === env && c === daCtx) {
        called.push('getObject');
        return {status: 200};
      }
    };

    const { getSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/get.js': {
          default: getResp
        }
      }
    );
    const resp = await getSource({env, daCtx});
    assert.equal(200, resp.status);
    assert.deepStrictEqual(called, ['getObject']);
  });

  it('Test getSource with', async () => {
    const env = {};
    const daCtx = { aclCtx: { pathLookup: new Map() }};

    const deleteResp = async (e, c) => {
      if (e === env && c === daCtx) {
        return {status: 204};
      }
    };

    const { deleteSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/delete.js': {
          default: deleteResp
        }
      }
    );

    const resp = await deleteSource({env, daCtx});
    assert.equal(204, resp.status);
  });

  it('Test getSource with permissions', async () => {
    const DA_CONFIG = {
      'test-source': {
        "total": 1,
        "limit": 1,
        "offset": 0,
        "permissions": {
          "data": [
            {
              "path": "/**",
              "groups": "2345B0EA551D747/4711,123",
              "actions": "read",
            },
            {
              "path": "/**",
              "groups": "2345B0EA551D747/8080",
              "actions": "write",
            },
            {
              "path": "/foo",
              "groups": "2345B0EA551D747/4711",
              "actions": "write",
            },
            {
              "path": "/bar",
              "groups": "2345B0EA551D747/4711",
              "actions": "",
            }
          ]
        },
        ":type": "multi-sheet"
      }
    };
    const env = {
      DA_CONFIG: {
        get: (name) => {
          return DA_CONFIG[name];
        },
      }
    };

    const daCtx = { users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}], org: 'test-source', env};

    const called = [];
    const getResp = async (e, c) => {
      if (e === env && c === daCtx) {
        called.push('getObject');
        return {status: 200};
      }
    };

    const { getSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/get.js': {
          default: getResp
        }
      }
    );

    daCtx.key = '/test';
    daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, daCtx.key);
    const resp = await getSource({env, daCtx});
    assert.equal(200, resp.status);
    assert.deepStrictEqual(called, ['getObject']);

    daCtx.key = '/bar';
    daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, daCtx.key);
    const resp2 = await getSource({env, daCtx});
    assert.equal(403, resp2.status);
  });

  it('Test deleteSource with permissions', async() => {
    const deleteCalled = [];
    const deleteCall = (e, c, d) => {
      deleteCalled.push({e, c, d});
    };

    const ctx = { key: '/a/b/c.html' };
    const hasPermission = (c, k, a) => {
      if (k === '/a/b/c.html' && a === 'write') {
        return false;
      }
      return true;
    }

    const { deleteSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/delete.js': {
          default: deleteCall
        },
        '../../src/utils/auth.js': {
          hasPermission
        },
      }
    );

    const resp = await deleteSource({ req: {}, env: {}, daCtx: ctx });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(deleteCalled.length, 0);

    await deleteSource({ req: {}, env: {}, daCtx: { key: 'foobar.html' }});
    assert.strictEqual(deleteCalled.length, 1);
    assert.strictEqual(deleteCalled[0].c.key, 'foobar.html');
  });

  it('Test postSource with permissions', async () => {
    const putCalled = [];
    const putCall = (e, c, o) => {
      putCalled.push({e, c, o});
      return { status: 202 }; // 202 skips the invalidate collab which is easy for the test
    };

    const ctx = { key: '/foo/bar.png' };
    const hasPermission = (c, k, a) => {
      if (k === '/foo/bar.png' && a === 'write') {
        return false;
      }
      return true;
    }

    const { postSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/put.js': {
          default: putCall
        },
        '../../src/utils/auth.js': {
          hasPermission
        },
      }
    );

    const resp = await postSource({ req: {}, env: {}, daCtx: ctx });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(putCalled.length, 0);

    await postSource({ req: { headers: new Headers() }, env: {}, daCtx: { key: 'haha.png' }});
    assert.strictEqual(putCalled.length, 1);
    assert.strictEqual(putCalled[0].c.key, 'haha.png');
  });
});