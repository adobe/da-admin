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
import handler from '../../src/routes/hlx6.js';

describe('Helix 6 compatibility bridge', () => {
  let getContext;
  let fetchStub;
  let env;

  before(async () => {
    getContext = await esmock('../../src/utils/daCtx.js', {
      '../../src/utils/auth.js': { getUsers: async () => [{ email: 'author@example.com' }] },
    });
  });

  beforeEach(() => {
    env = {
      AEM_API: 'https://api.example.com',
      DA_CONTENT: 'https://content.da.live',
      HLX6_MIGRATED_SITES: ['org/site'],
    };
    fetchStub = sinon.stub(globalThis, 'fetch');
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
  });

  afterEach(() => sinon.restore());

  /**
   * Exercises a bridge route with a legacy request and the normal DA context builder.
   * @param {string} path Legacy API path.
   * @param {RequestInit} [options={}] Request overrides with object-shaped headers.
   * @param {typeof handler} [run=handler] Bridge route under test.
   * @returns {Promise<Response>} Route response.
   */
  async function call(path, options = {}, run = handler) {
    const req = new Request(`https://admin.da.live${path}`, {
      ...options, headers: { authorization: 'Bearer caller', ...options.headers },
    });
    const daCtx = await getContext(req, env);
    return run({ req, env, daCtx });
  }

  it('streams an authenticated read without false DA IDs or permissions', async () => {
    const upstream = new Response('source bytes', {
      headers: { 'content-type': 'text/html', etag: '"revision"', 'last-modified': 'Mon, 23 Nov 2026 08:00:00 GMT' },
    });
    sinon.stub(upstream, 'text').throws(new Error('Do not buffer source reads'));
    fetchStub.resolves(upstream);
    const resp = await call('/source/org/site/library/blocks/columns.html?token=do-not-forward');
    assert.strictEqual(fetchStub.firstCall.args[0], 'https://api.example.com/org/sites/site/source/library/blocks/columns.html');
    assert.strictEqual(fetchStub.firstCall.args[1].headers.get('authorization'), 'Bearer caller');
    assert.strictEqual(fetchStub.firstCall.args[1].redirect, 'manual');
    assert.strictEqual(await resp.text(), 'source bytes');
    assert.strictEqual(resp.headers.get('etag'), '"revision"');
    assert.strictEqual(resp.headers.get('last-modified'), 'Mon, 23 Nov 2026 08:00:00 GMT');
    assert.strictEqual(resp.headers.get('cache-control'), 'private, no-store');
    assert.strictEqual(resp.headers.get('x-da-id'), null);
    assert.strictEqual(resp.headers.get('x-da-actions'), null);
  });

  it('restores weak If-None-Match and precedence over If-Match', async () => {
    fetchStub.resolves(new Response('unchanged', { headers: { etag: '"revision"' } }));
    const resp = await call('/source/org/site/a.json', {
      headers: { 'if-none-match': '"old", W/"revision"', 'if-match': '"other"' },
    });
    assert.strictEqual(resp.status, 304);
    assert.strictEqual(await resp.text(), '');
    assert.strictEqual(resp.headers.get('etag'), '"revision"');
  });

  it('returns 412 rather than stale bytes for a failed read If-Match', async () => {
    fetchStub.resolves(new Response('new bytes', { headers: { etag: '"new"' } }));
    const resp = await call('/source/org/site/a.json', { headers: { 'if-match': '"old"' } });
    assert.strictEqual(resp.status, 412);
    assert.strictEqual(await resp.text(), '');
  });

  it('forwards HEAD without a body and preserves metadata', async () => {
    fetchStub.resolves(new Response(null, { headers: { etag: '"revision"', 'content-length': '42' } }));
    const resp = await call('/source/org/site/a.json', { method: 'HEAD' });
    assert.strictEqual(fetchStub.firstCall.args[1].method, 'HEAD');
    assert.strictEqual(await resp.text(), '');
    assert.strictEqual(resp.headers.get('content-length'), '42');
  });

  it('normalizes listing paths, dates and existing DA hidden-file rules', async () => {
    fetchStub.resolves(new Response(JSON.stringify([
      { name: 'folder/', 'content-type': 'application/folder' },
      { name: '.private/', 'content-type': 'application/folder' },
      { name: 'a.json', 'last-modified': '2026-11-23T08:00:00Z' },
      { name: 'a.json.props', 'last-modified': '2026-11-23T08:00:00Z' },
      { name: '.hidden.json', 'last-modified': '2026-11-23T08:00:00Z' },
    ])));
    const resp = await call('/list/org/site/library');
    assert.strictEqual(fetchStub.firstCall.args[0], 'https://api.example.com/org/sites/site/source/library/');
    assert.deepStrictEqual(await resp.json(), [
      {
        path: '/org/site/library/a.json', name: 'a', ext: 'json', lastModified: Date.parse('2026-11-23T08:00:00Z'),
      },
      { path: '/org/site/library/folder', name: 'folder' },
    ]);
  });

  it('rejects legacy site-list pagination rather than repeating the first page', async () => {
    const resp = await call('/list/org/site', { headers: { 'da-continuation-token': 'old-page' } });
    assert.strictEqual(resp.status, 400);
    assert.match((await resp.json()).error, /not paginated/);
    assert(fetchStub.notCalled);
  });

  it('fails explicitly on malformed upstream listing JSON', async () => {
    fetchStub.resolves(new Response('{}'));
    const resp = await call('/list/org/site');
    assert.strictEqual(resp.status, 502);
    assert.match(resp.headers.get('x-error'), /listing/);
  });

  it('converts editor arrays to DA multi-sheet wrappers', async () => {
    fetchStub.resolves(new Response(JSON.stringify({ data: [{ key: 'theme', value: 'dark' }], library: [{ title: 'Blocks' }] })));
    const resp = await call('/config/org/site');
    assert.strictEqual(fetchStub.firstCall.args[0], 'https://api.example.com/org/sites/site/config/editor/da.json');
    const config = await resp.json();
    assert.deepStrictEqual(config[':names'], ['data', 'library']);
    assert.deepStrictEqual(config.library, {
      total: 1, limit: 1, offset: 0, data: [{ title: 'Blocks' }],
    });
  });

  it('saves multipart config to editor.da only and returns the legacy shape', async () => {
    const form = new FormData();
    form.set('config', JSON.stringify({
      ':type': 'sheet', ':sheetname': 'library', data: [{ title: 'Blocks' }],
    }));
    fetchStub.resolves(new Response(null, { status: 201 }));
    const resp = await call('/config/org/site', { method: 'PUT', body: form });
    assert.strictEqual(fetchStub.firstCall.args[0], 'https://api.example.com/org/sites/site/config/editor/da.json');
    const options = fetchStub.firstCall.args[1];
    assert.strictEqual(options.method, 'POST');
    assert.deepStrictEqual(JSON.parse(options.body), { library: [{ title: 'Blocks' }] });
    assert.strictEqual(resp.status, 201);
    assert.strictEqual((await resp.json())[':sheetname'], 'library');
  });

  it('rejects malformed config before saving anything', async () => {
    const form = new FormData();
    form.set('config', '{"library":"not rows"}');
    const resp = await call('/config/org/site', { method: 'POST', body: form });
    assert.strictEqual(resp.status, 400);
    assert.match((await resp.json()).error, /configuration/);
    assert(fetchStub.notCalled);
  });

  it('unwraps a source multipart save and returns DA source/preview/live URLs', async () => {
    const form = new FormData();
    form.set('data', new Blob(['{"data":[]}'], { type: 'application/json' }), 'tags.json');
    fetchStub.resolves(new Response(null, { status: 201, headers: { etag: '"saved"' } }));
    const resp = await call('/source/org/site/.tags/taxonomy.json', { method: 'PUT', body: form });
    const options = fetchStub.firstCall.args[1];
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers.get('content-type'), 'application/json');
    assert.strictEqual(new TextDecoder().decode(options.body), '{"data":[]}');
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(resp.headers.get('etag'), '"saved"');
    assert.deepStrictEqual(await resp.json(), {
      source: {
        editUrl: 'https://da.live/edit#/org/site/.tags/taxonomy.json',
        contentUrl: 'https://content.da.live/org/site/.tags/taxonomy.json',
      },
      aem: {
        previewUrl: 'https://main--site--org.aem.page/.tags/taxonomy.json',
        liveUrl: 'https://main--site--org.aem.live/.tags/taxonomy.json',
      },
    });
  });

  it('uses POST for legacy HTML PUT and forwards write preconditions', async () => {
    fetchStub.resolves(new Response(null, { status: 201 }));
    await call('/source/org/site/a.html', {
      method: 'PUT',
      body: '<main><div>content</div></main>',
      headers: { 'content-type': 'text/html', 'if-match': '"old"' },
    });
    const options = fetchStub.firstCall.args[1];
    assert.strictEqual(options.method, 'POST');
    assert.strictEqual(options.headers.get('if-match'), '"old"');
    assert.strictEqual(new TextDecoder().decode(options.body), '<main><div>content</div></main>');
  });

  ['/canonical.html', '/org/sites/site/source/canonical.html'].forEach((location) => {
    it(`uses the canonical upstream Location ${location} for saved legacy URLs`, async () => {
      fetchStub.resolves(new Response(null, { status: 201, headers: { location } }));
      const resp = await call('/source/org/site/original.html', {
        method: 'POST', body: '<main></main>', headers: { 'content-type': 'text/html' },
      });
      assert.strictEqual((await resp.json()).source.editUrl, 'https://da.live/edit#/org/site/canonical');
      assert.strictEqual(resp.headers.get('location'), 'https://admin.da.live/source/org/site/canonical.html');
    });
  });

  it('reports a saved source with a malformed Location without throwing', async () => {
    fetchStub.resolves(new Response(null, { status: 201, headers: { location: '/bad%E0%A4%A.html' } }));
    const resp = await call('/source/org/site/a.html', {
      method: 'POST', body: '<main></main>', headers: { 'content-type': 'text/html' },
    });
    assert.strictEqual(resp.status, 502);
    assert.match((await resp.json()).error, /saved content.*do not blindly retry/);
  });

  it('rejects upstream redirects instead of passing them through', async () => {
    fetchStub.resolves(new Response('moved', { status: 302, headers: { location: 'https://elsewhere.example/' } }));
    const resp = await call('/source/org/site/a.json');
    assert.strictEqual(resp.status, 502);
    assert.strictEqual(resp.headers.get('location'), null);
  });

  it('labels string SVG uploads and rejects unknown text extensions', async () => {
    fetchStub.resolves(new Response(null, { status: 201 }));
    const svg = new FormData();
    svg.set('data', '<svg></svg>');
    await call('/source/org/site/icon.svg', { method: 'POST', body: svg });
    assert.strictEqual(fetchStub.firstCall.args[1].headers.get('content-type'), 'image/svg+xml');
    const txt = new FormData();
    txt.set('data', 'plain');
    const resp = await call('/source/org/site/notes.txt', { method: 'POST', body: txt });
    assert.strictEqual(resp.status, 415);
    assert(fetchStub.calledOnce);
  });

  it('does not forward preconditions to listing or config requests', async () => {
    fetchStub.callsFake(async () => new Response('[]'));
    const headers = { 'if-none-match': '"x"', 'if-match': '"y"' };
    await call('/list/org/site', { headers });
    fetchStub.callsFake(async () => new Response('{"data":[]}'));
    await call('/config/org/site', { headers });
    fetchStub.getCalls().forEach(({ args }) => {
      assert.strictEqual(args[1].headers.get('if-none-match'), null);
      assert.strictEqual(args[1].headers.get('if-match'), null);
    });
    assert(fetchStub.calledTwice);
  });

  it('does not redirect a saved source envelope to another host', async () => {
    fetchStub.resolves(new Response(null, {
      status: 201, headers: { location: 'https://other.example/file.html' },
    }));
    const resp = await call('/source/org/site/a.html', {
      method: 'POST', body: '<main></main>', headers: { 'content-type': 'text/html' },
    });
    assert.strictEqual(resp.status, 502);
    assert.match((await resp.json()).error, /saved content.*do not blindly retry/);
    assert(fetchStub.calledOnce);
  });

  it('creates bodyless folders using a slash POST', async () => {
    fetchStub.resolves(new Response(null, { status: 201 }));
    const resp = await call('/source/org/site/new-folder', { method: 'PUT' });
    assert.strictEqual(fetchStub.firstCall.args[0], 'https://api.example.com/org/sites/site/source/new-folder/');
    assert.strictEqual(fetchStub.firstCall.args[1].body, undefined);
    assert.strictEqual(resp.status, 201);
    assert.strictEqual((await resp.json()).source.editUrl, 'https://da.live/org/site/new-folder');
  });

  [401, 403, 413, 429, 500].forEach((status) => {
    it(`returns upstream save failure ${status} without retry or success JSON`, async () => {
      fetchStub.resolves(new Response('upstream error', {
        status, headers: { 'x-error': 'receiver failure', 'retry-after': '60' },
      }));
      const resp = await call('/source/org/site/a.json', {
        method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
      });
      assert.strictEqual(resp.status, status);
      assert.strictEqual(await resp.text(), 'upstream error');
      assert.strictEqual(resp.headers.get('x-error'), 'receiver failure');
      assert.strictEqual(resp.headers.get('retry-after'), '60');
      assert(fetchStub.calledOnce);
    });
  });

  it('surfaces unknown mutation outcomes without replaying them', async () => {
    fetchStub.rejects(new Error('Connection reset'));
    const resp = await call('/source/org/site/a.json', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
    });
    assert.strictEqual(resp.status, 502);
    assert.match((await resp.json()).error, /not automatically retried/);
    assert(fetchStub.calledOnce);
  });

  ['', 'Bearer first, Bearer second'].forEach((authorization) => {
    it(`rejects ${authorization ? 'multiple' : 'missing'} author credentials`, async () => {
      const resp = await call('/source/org/site/a.json', { headers: { authorization } });
      assert.strictEqual(resp.status, authorization ? 410 : 401);
      assert(fetchStub.notCalled);
    });
  });

  it('rejects GUIDs instead of ignoring document identity', async () => {
    const form = new FormData();
    form.set('data', new Blob(['{}'], { type: 'application/json' }));
    form.set('guid', 'old-document-uuid');
    const resp = await call('/source/org/site/a.json', { method: 'POST', body: form });
    assert.strictEqual(resp.status, 410);
    assert.match((await resp.json()).error, /GUID/);
    assert(fetchStub.notCalled);
  });

  [
    ['/source/org/site/a.html', 'DELETE'],
    ['/versionsource/org/site/id/version.html', 'GET'],
    ['/versionlist/org/site/a.html', 'GET'],
    ['/copy/org/site/a.html', 'POST'],
    ['/move/org/site/a.html', 'POST'],
    ['/media/org/site/a.jpg', 'POST'],
  ].forEach(([path, method]) => {
    it(`keeps unsupported ${method} ${path} blocked`, async () => {
      const resp = await call(path, { method });
      assert.strictEqual(resp.status, 410);
      assert(fetchStub.notCalled);
    });
  });

  it('blocks history suffixes through generic source routes', async () => {
    const resp = await call('/source/org/site/a.html/.history');
    assert.strictEqual(resp.status, 404);
    assert(fetchStub.notCalled);
  });

  it('retains legacy write ACLs before an upstream save', async () => {
    env.DA_CONFIG = {
      get: async () => ({
        permissions: {
          data: [
            { path: '/site/**', actions: 'read', groups: 'author@example.com' },
          ],
        },
      }),
    };
    const resp = await call('/source/org/site/a.json', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
    });
    assert.strictEqual(resp.status, 403);
    assert(fetchStub.notCalled);
  });

  it('merges configured migrated sites on the first org page only, without an HLX6 call', async () => {
    env.HLX6_MIGRATED_SITES = ['org/site', 'org/other', 'elsewhere/site'];
    const legacy = sinon.stub().resolves({
      status: 200,
      body: JSON.stringify([
        { path: '/org/site', name: 'site' }, { path: '/org/legacy', name: 'legacy' },
      ]),
      continuationToken: 'next-page',
    });
    const module = await esmock('../../src/routes/hlx6.js', {
      '../../src/routes/list.js': { default: legacy },
    });
    const first = await call('/list/org', {}, module.listHlx6Org);
    assert.deepStrictEqual(await first.json(), [
      { path: '/org/legacy', name: 'legacy' },
      { path: '/org/other', name: 'other' },
      { path: '/org/site', name: 'site' },
    ]);
    assert.strictEqual(first.headers.get('da-continuation-token'), 'next-page');
    const second = await call('/list/org', {
      headers: { 'da-continuation-token': 'next-page' },
    }, module.listHlx6Org);
    assert.deepStrictEqual(await second.json(), [{ path: '/org/legacy', name: 'legacy' }]);
    assert(fetchStub.notCalled);
  });

  it('filters configured migrated sites by DA ACLs for descendant-only org readers', async () => {
    env.HLX6_MIGRATED_SITES = ['org/site', 'org/other'];
    env.DA_CONFIG = {
      get: async () => ({
        permissions: {
          data: [
            { path: '/site/docs/**', actions: 'read', groups: 'author@example.com' },
          ],
        },
      }),
    };
    const module = await esmock('../../src/routes/hlx6.js', {
      '../../src/routes/list.js': { default: async () => ({ status: 200, body: '[]' }) },
    });
    const resp = await call('/list/org', {}, module.listHlx6Org);
    assert.deepStrictEqual(await resp.json(), [{ path: '/org/site', name: 'site' }]);
    assert(fetchStub.notCalled);
  });

  it('propagates legacy org-list failures', async () => {
    const module = await esmock('../../src/routes/hlx6.js', {
      '../../src/routes/list.js': { default: async () => ({ status: 404, body: '' }) },
    });
    const resp = await call('/list/org', {}, module.listHlx6Org);
    assert.strictEqual(resp.status, 404);
  });
});

describe('Migration route wiring', () => {
  const env = {
    AEM_API: 'https://api.example.com',
    HLX6_DUAL_WRITES: ['org/site -> target/site2'],
  };
  const base = 'https://api.example.com/target/sites/site2/source';
  let fetchStub;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => new Response(null, { status: 201 }));
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
  });
  afterEach(() => sinon.restore());

  ['copy', 'move'].forEach((operation) => {
    it(`blocks ${operation} into migrated legacy storage before modifying either site`, async () => {
      const storage = sinon.stub().resolves({ status: 204 });
      const route = await esmock(`../../src/routes/${operation}.js`, {
        '../../src/utils/auth.js': { hasPermission: () => true },
        [`../../src/storage/object/${operation}.js`]: { default: storage },
      });
      const req = new Request(`https://admin.da.live/${operation}/org/legacy/a.html`, {
        method: 'POST', body: new URLSearchParams({ destination: '/org/migrated/a.html' }),
      });
      const resp = await route({
        req,
        env: { HLX6_MIGRATED_SITES: ['org/migrated'] },
        daCtx: { org: 'org', key: 'legacy/a.html' },
      });
      assert.strictEqual(resp.status, 410);
      assert(storage.notCalled);
      assert(fetchStub.notCalled);
    });
  });

  it('records successful legacy media uploads as not propagated to hlx6', async () => {
    const postMedia = await esmock('../../src/routes/media.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
    });
    const data = new FormData();
    data.set('data', new File(['image'], 'image.jpg', { type: 'image/jpeg' }));
    const req = new Request('https://admin.da.live/media/org/site/image.jpg', {
      method: 'POST', headers: { authorization: 'Bearer test-token' }, body: data,
    });
    fetchStub.callsFake(async () => new Response('{"uri":"https://legacy.example/media.jpg"}'));
    const daCtx = {
      org: 'org', key: 'site/image.jpg', site: 'site', aemPathname: '/image.jpg',
    };
    const response = await postMedia.default({
      req, daCtx, env: { ...env, AEM_ADMIN_MEDIA_API: 'https://legacy.example/media' },
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(JSON.parse(response.body).uri, 'https://legacy.example/media.jpg');
    assert(fetchStub.calledOnce);
    const records = console.log.getCalls()
      .filter(({ args }) => args[0] === '[hlx6:event]')
      .map(({ args }) => JSON.parse(args[1]));
    assert.strictEqual(records.at(-1).reason, 'media_upload_not_propagated');
    assert.strictEqual(records.at(-1).operation, 'MEDIA');
    assert.strictEqual(records.at(-1).daKey, 'site/image.jpg');
  });

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
