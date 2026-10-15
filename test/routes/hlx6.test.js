/*
 * Copyright 2026 Adobe. All rights reserved.
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
import sinon from 'sinon';

describe('Migration route wiring', () => {
  const env = {
    AEM_API: 'https://api.example.com',
    HLX6_MIGRATION_SITES: ['org/site -> target/site2'],
  };
  const base = 'https://api.example.com/target/sites/site2/source';
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => new Response(null, { status: 201 }));
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
  });

  afterEach(() => sinon.restore());

  it('preserves a successful DA write when the background request rejects', async () => {
    const response = { status: 201, body: '{"source":"DA"}' };
    const routes = await esmock('../../src/routes/source.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/put.js': { default: async () => response },
      '../../src/storage/utils/object.js': { notifyCollab: async () => {} },
    });
    const failure = new Error('hlx6 unavailable');
    fetchStub.rejects(failure);
    const waited = [];
    const req = new Request('https://admin.da.live/source/org/site/a.html', {
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'content-type': 'text/html' },
      body: '<body><main>DA</main></body>',
    });
    const daCtx = {
      org: 'org',
      key: 'site/a.html',
      ext: 'html',
      waitUntil: (task) => waited.push(task),
    };
    assert.strictEqual(await routes.postSource({ req, env, daCtx }), response);
    assert.strictEqual(waited.length, 1);
    await Promise.all(waited);
    assert(fetchStub.calledOnce);
    assert(console.error.getCalls().some(({ args }) => args[1] === failure));
  });

  ['write', 'delete', 'copy', 'move'].forEach((operation) => {
    [operation === 'write' ? 201 : 204, 412].forEach((status) => {
      it(`${operation} preserves DA status ${status} and propagates only success`, async () => {
        const response = { status, body: '{"source":"DA"}', etag: '"da-etag"' };
        const permission = sinon.stub().returns(true);
        const storage = sinon.stub().resolves(response);
        const auth = { '../../src/utils/auth.js': { hasPermission: permission } };
        let route;
        let req;
        let expected;
        if (operation === 'write' || operation === 'delete') {
          const routes = await esmock('../../src/routes/source.js', {
            ...auth,
            '../../src/storage/object/put.js': { default: storage },
            '../../src/storage/object/delete.js': { default: storage },
            '../../src/storage/utils/object.js': { notifyCollab: async () => {} },
          });
          route = operation === 'write' ? routes.postSource : routes.deleteSource;
          const data = new FormData();
          data.set('data', new File(['<body><main>DA</main></body>'], 'source', { type: 'text/html' }));
          req = new Request('https://admin.da.live/source/org/site/a.html', {
            method: operation === 'write' ? 'PUT' : 'DELETE',
            headers: { authorization: 'Bearer test-token' },
            ...(operation === 'write' ? { body: data } : {}),
          });
          expected = [[operation === 'write' ? 'POST' : 'DELETE', `${base}/a.html`]];
        } else {
          route = await esmock(`../../src/routes/${operation}.js`, {
            ...auth,
            [`../../src/storage/object/${operation}.js`]: { default: storage },
          });
          req = new Request(`https://admin.da.live/${operation}/org/site/a.html`, {
            method: 'POST',
            headers: { authorization: 'Bearer test-token' },
            body: new URLSearchParams({ destination: '/org/site/b.html' }),
          });
          expected = [['PUT', `${base}/b.html?source=%2Fa.html&collision=overwrite`]];
          if (operation === 'move') expected.push(['DELETE', `${base}/a.html`]);
        }

        const waited = [];
        const daCtx = {
          org: 'org',
          key: 'site/a.html',
          isFile: true,
          ext: 'html',
          waitUntil: (promise) => waited.push(promise),
        };
        const deniedReq = req.clone();
        assert.strictEqual(await route({ req, env, daCtx }), response);
        assert(storage.calledOnce);
        assert.strictEqual(waited.length, status === 412 ? 0 : 1);
        await Promise.all(waited);
        assert.deepStrictEqual(
          fetchStub.getCalls().map(({ args: [url, opts] }) => [opts.method, url.toString()]),
          status === 412 ? [] : expected,
        );
        for (const { args: [, opts] } of fetchStub.getCalls()) {
          assert.strictEqual(opts.headers.authorization, 'Bearer test-token');
          assert.strictEqual(opts.headers['x-content-source-authorization'], undefined);
        }

        permission.returns(false);
        assert.strictEqual((await route({ req: deniedReq, env, daCtx })).status, 403);
        assert(storage.calledOnce);
        assert.strictEqual(waited.length, status === 412 ? 0 : 1);
      });
    });
  });
});
