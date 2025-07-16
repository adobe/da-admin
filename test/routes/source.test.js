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
import { describe, it, afterEach, vi, expect, beforeAll } from 'vitest';
import { getSource, postSource, deleteSource } from '../../src/routes/source.js';
import getObject from '../../src/storage/object/get.js';
import putObject from '../../src/storage/object/put.js';
import deleteObjects from '../../src/storage/object/delete.js';
import { invalidateCollab } from '../../src/storage/utils/object.js';
import putHelper from '../../src/helpers/source.js';
import deleteHelper from '../../src/helpers/delete.js';
import { hasPermission } from '../../src/utils/auth.js';
import { getAclCtx } from '../../src/utils/auth.js';

describe('Source Route', () => {
  beforeAll(() => {
    vi.mock('../../src/storage/object/get.js', () => ({
      default: vi.fn()
    }));
    vi.mock('../../src/storage/object/put.js', () => ({
      default: vi.fn()
    }));
    vi.mock('../../src/storage/object/delete.js', () => ({
      default: vi.fn()
    }));
    vi.mock('../../src/storage/utils/object.js', async () => ({
      invalidateCollab: vi.fn()
    }));
    vi.mock('../../src/helpers/source.js', () => ({
      default: vi.fn()
    }));
    vi.mock('../../src/helpers/delete.js', () => ({
      default: vi.fn()
    }));
    vi.mock('../../src/utils/auth.js', async () => {
      const actual = await vi.importActual('../../src/utils/auth.js');
      return {
        ...actual,
        hasPermission: vi.fn(actual.hasPermission)
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    putObject.mockImplementation(() => ({ status: 200 }));
    putHelper.mockImplementation(() => ({ data: 'test' }));

    const headers = new Map();
    headers.set('x-da-initiator', 'blah');

    const req = {
      headers,
      url: 'http://localhost:9876/source/somedoc.html'
    };

    const resp = await postSource({ req, env, daCtx });
    expect(resp.status).to.eq(200);
    expect(invalidateCollab).toHaveBeenCalledWith('syncadmin', req.url, env);
  });

  it('Test postSource from collab does not trigger invalidate callback', async () => {
    putObject.mockImplementation(() => ({ status: 201 }));
    putHelper.mockImplementation(() => ({ data: 'test' }));

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
      expect(resp.status).to.eq(201);
      expect(callbacks.length).to.eq(0);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Test failing postSource does not trigger callback', async () => {
    putObject.mockImplementation(() => ({ status: 500 }));
    putHelper.mockImplementation(() => ({ data: 'test' }));

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
      expect(resp.status).to.eq(500);
      expect(callbacks.length).to.eq(0);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Test getSource', async () => {
    const env = {};
    const daCtx = { aclCtx: { pathLookup: new Map() }};

    getObject.mockImplementation(() => ({ status: 200 }));

    const resp = await getSource({ env, daCtx });
    expect(resp.status).to.eq(200);
    expect(getObject).toHaveBeenCalledWith(env, daCtx, undefined);
  });

  it('Test deleteSource with 204', async () => {
    const env = {};
    const daCtx = { aclCtx: { pathLookup: new Map() }};

    deleteObjects.mockImplementation(() => ({ status: 204 }));
    deleteHelper.mockImplementation(() => ({ key: 'test' }));

    const resp = await deleteSource({ req: {}, env, daCtx });
    expect(resp.status).to.eq(204);
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

    const daCtx = { users: [{
      orgs: [{
        orgIdent: '2345B0EA551D747',
        groups: [{'groupName': '4711'}]
      }]}],
      org: 'test-source', env};

    getObject.mockImplementation(() => ({ status: 200 }));

    daCtx.key = '/test';
    daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, daCtx.key);
    const resp = await getSource({ env, daCtx });
    expect(resp.status).to.eq(200);
    expect(getObject).toHaveBeenCalledWith(env, daCtx, undefined);

    daCtx.key = '/bar';
    daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, daCtx.key);
    const resp2 = await getSource({ env, daCtx });
    expect(resp2.status).to.eq(403);
  });

  it('Test deleteSource with permissions', async() => {
    const ctx = { key: '/a/b/c.html' };

    hasPermission.mockImplementation((c, k, a) => {
      if (k === '/a/b/c.html' && a === 'write') {
        return false;
      }
      return true;
    });

    deleteHelper.mockImplementation(() => ({ key: 'test' }));

    const resp = await deleteSource({ req: {}, env: {}, daCtx: ctx });
    expect(resp.status).to.eq(403);
    expect(deleteObjects).not.toHaveBeenCalled();

    deleteObjects.mockReturnValueOnce({ status: 200 });
    const resp2 = await deleteSource({ req: {}, env: {}, daCtx: { key: 'foobar.html' }});
    expect(resp2.status).to.eq(200);
    expect(deleteObjects).toHaveBeenCalledWith({}, { key: 'foobar.html' }, { key: 'test' });
  });

  it('Test postSource with permissions', async () => {
    const ctx = { key: '/foo/bar.png' };

    hasPermission.mockImplementation((c, k, a) => {
      if (k === '/foo/bar.png' && a === 'write') {
        return false;
      }
      return true;
    });

    putObject.mockImplementation(() => ({ status: 202 }));
    putHelper.mockImplementation(() => ({ data: 'test' }));

    const resp = await postSource({ req: {}, env: {}, daCtx: ctx });
    expect(resp.status).to.eq(403);
    expect(putObject).not.toHaveBeenCalled();

    const resp2 = await postSource({ req: { headers: new Headers() }, env: {}, daCtx: { key: 'haha.png' }});
    expect(resp2.status).to.eq(202);
    expect(putObject).toHaveBeenCalledWith({}, { key: 'haha.png' }, { data: 'test' });
  });

  it('Test postSource with provided guid', async () => {
    const ctx = { key: '/foo/bar.png' };

    hasPermission.mockImplementation(() => true);
    putObject.mockImplementation(() => ({ status: 202 }));
    putHelper.mockImplementation(() => ({ data: 'some data', guid: 'aaaa-bbbb-1234-5678' }));

    const body = new FormData();
    body.append('data', 'some data');
    body.append('guid', 'aaaa-bbbb-1234-5678');

    const opts = { body, method: 'POST' };
    const req = new Request('https://blah.org', opts);

    const resp = await postSource({ req, env: {}, daCtx: ctx });
    expect(resp.status).to.eq(202);
    expect(putObject).toHaveBeenCalledWith({}, ctx, { data: 'some data', guid: 'aaaa-bbbb-1234-5678' });
  });
});
