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


describe('Source Route', () => {
  it('Test postSource triggers callback', async () => {
    const env = { DA_COLLAB: 'http://localhost:1234' };
    const daCtx = {};
    const putResp = async (e, c) => {
      if (e === env && c === daCtx) {
        return { status: 201 };
      }
    };

    const { postSource } = await esmock(
      '../../src/routes/source.js', {
        '../../src/storage/object/put.js': {
          default: putResp
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

      const resp = await postSource({ req, env, daCtx });
      assert.equal(201, resp.status);
      assert.equal(1, callbacks.length);
      assert.equal('http://localhost:1234/api/v1/syncadmin?doc=http://localhost:8787/source/a/b/mydoc.html', callbacks[0]);
    } finally {
      globalThis.fetch = savedFetch;
    }
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

    const daCtx = {};
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
      const daCtx = {};

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
      const daCtx = {};

      const resp = await postSource({ req, env, daCtx });
      assert.equal(500, resp.status);
      assert.equal(0, callbacks.length);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Test getSource', async () => {
    const env = {};
    const daCtx = {};

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

  it('Test deleteSource', async () => {
    const env = {};
    const daCtx = {};

    const called = [];
    const deleteResp = async (e, c) => {
      if (e === env && c === daCtx) {
        called.push('deleteObject');
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
    assert.deepStrictEqual(called, ['deleteObject']);
  });
});