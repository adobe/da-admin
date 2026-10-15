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
import sinon from 'sinon';
import {
  parseMigrationSites, getHlx6Target, syncSourcePut, syncSourceDelete,
  syncCopy, syncMove, syncVersion, initHlx6,
} from '../../src/utils/hlx6.js';

const API = 'https://api.example.com';

function makeReq(auth = 'Bearer tok1') {
  return { headers: new Headers(auth ? { authorization: auth } : {}) };
}

describe('hlx6 propagation', () => {
  let savedFetch;
  let calls;
  let fetchStatus;
  let logs;
  let errors;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
    calls = [];
    fetchStatus = () => 200;
    logs = sinon.stub(console, 'log');
    errors = sinon.stub(console, 'error');
    sinon.stub(console, 'warn');
    globalThis.fetch = async (url, opts) => {
      calls.push({ url: url.toString(), opts });
      const status = fetchStatus(url.toString(), opts);
      return new Response(null, { status });
    };
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
    sinon.restore();
  });

  const env = {
    AEM_API: API,
    HLX6_MIGRATION_SITES: ['myorg/mysite', 'myorg/other -> org2/site2', 'myorg/third -> org2/site2'],
  };

  describe('parseMigrationSites', () => {
    it('parses both formats, normalizes and skips invalid entries', () => {
      const map = parseMigrationSites([
        ' MyOrg/MySite ',
        'a/b -> c/d',
        'a/b/c',
        'x/y -> z',
        'a -> b/c',
        'p/q -> r/s -> t/u',
        '',
        42,
      ]);
      assert.deepStrictEqual([...map.entries()], [
        ['myorg/mysite', { org: 'myorg', site: 'mysite' }],
        ['a/b', { org: 'c', site: 'd' }],
      ]);
    });

    it('accepts JSON and comma separated strings', () => {
      assert.deepStrictEqual(
        [...parseMigrationSites('["a/b", "c/d -> e/f"]').keys()],
        ['a/b', 'c/d'],
      );
      assert.deepStrictEqual(
        [...parseMigrationSites('a/b, c/d -> e/f').keys()],
        ['a/b', 'c/d'],
      );
      assert.strictEqual(parseMigrationSites('[invalid').size, 0);
      assert.strictEqual(parseMigrationSites('{"a": 1}').size, 0);
      assert.strictEqual(parseMigrationSites(undefined).size, 0);
      assert.strictEqual(parseMigrationSites({}).size, 0);
    });
  });

  describe('getHlx6Target', () => {
    it('logs setup once per configuration and refreshes changed mappings', () => {
      const config = { HLX6_MIGRATION_SITES: ['setup/site -> target/one'] };
      initHlx6(config);
      assert.deepStrictEqual(getHlx6Target(config, 'setup', 'site'), { org: 'target', site: 'one' });
      const count = logs.callCount;
      initHlx6(config);
      assert.strictEqual(logs.callCount, count);
      assert(logs.getCalls().some(({ args }) => args.join(' ').includes('setup/site -> target/one')));

      config.HLX6_MIGRATION_SITES = ['setup/site -> target/two'];
      initHlx6(config);
      assert.deepStrictEqual(getHlx6Target(config, 'setup', 'site'), { org: 'target', site: 'two' });
      assert(logs.callCount > count);
    });

    it('returns target for migrated sites only', () => {
      assert.deepStrictEqual(getHlx6Target(env, 'myorg', 'MySite'), { org: 'myorg', site: 'mysite' });
      assert.deepStrictEqual(getHlx6Target(env, 'myorg', 'other'), { org: 'org2', site: 'site2' });
      assert.strictEqual(getHlx6Target(env, 'myorg', 'nope'), undefined);
      assert.strictEqual(getHlx6Target(env, 'myorg'), undefined);
      assert.strictEqual(getHlx6Target({}, 'myorg', 'mysite'), undefined);
    });
  });

  describe('syncSourcePut', () => {
    it('uses the default API and preserves binary bytes without a MIME type', async () => {
      const bytes = new Uint8Array([0, 255, 128, 42]);
      await syncSourcePut({
        req: makeReq(),
        env: { HLX6_MIGRATION_SITES: ['myorg/mysite'] },
        daCtx: { org: 'myorg', key: 'mysite/image.png', ext: 'png' },
        obj: { data: new Blob([bytes]) },
        resp: { status: 201 },
      });
      assert.strictEqual(calls[0].url, 'https://api.aem.live/myorg/sites/mysite/source/image.png');
      assert.deepStrictEqual(new Uint8Array(calls[0].opts.body), bytes);
      assert.strictEqual(calls[0].opts.headers['content-type'], undefined);
    });

    it('posts JSON strings without serializing them twice', async () => {
      await syncSourcePut({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/data.json', ext: 'json' },
        obj: { data: '{"data":[1,2]}' },
        resp: { status: 201 },
      });
      assert.strictEqual(calls[0].opts.body, '{"data":[1,2]}');
      assert.strictEqual(calls[0].opts.headers['content-type'], 'application/json');
    });

    it('skips missing keys and an empty first authorization token', () => {
      const base = {
        req: makeReq(), env, obj: { data: 'x' }, resp: { status: 201 },
      };
      assert.strictEqual(syncSourcePut({ ...base, daCtx: { org: 'myorg' } }), undefined);
      assert.strictEqual(syncSourcePut({
        ...base,
        req: makeReq(', Bearer second-token'),
        daCtx: { org: 'myorg', key: 'mysite/a.html' },
      }), undefined);
      assert.strictEqual(calls.length, 0);
    });

    it('logs the entire successful response body and location', async () => {
      const body = JSON.stringify({ copied: [{ src: '/a.html', dst: '/b.html' }] });
      globalThis.fetch = async () => new Response(body, {
        status: 201, headers: { location: '/myorg/sites/mysite/source/a.html' },
      });
      await syncSourcePut({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/a.html', ext: 'html' },
        obj: { data: '<body></body>' },
        resp: { status: 201 },
      });
      const output = logs.getCalls().map(({ args }) => args.join(' ')).join('\n');
      assert(output.includes(`body: ${body}`));
      assert(output.includes('location: /myorg/sites/mysite/source/a.html'));
      assert(output.includes(': 201 in '));
      assert.strictEqual(errors.callCount, 0);
    });

    it('settles the background task if reading the response body fails', async () => {
      const response = new Response(null, { status: 201 });
      sinon.stub(response, 'text').rejects(new Error('body stream interrupted'));
      globalThis.fetch = async () => response;
      const waited = [];
      const promise = syncSourcePut({
        req: makeReq(),
        env,
        daCtx: {
          org: 'myorg',
          key: 'mysite/a.html',
          ext: 'html',
          waitUntil: (task) => waited.push(task),
        },
        obj: { data: 'html' },
        resp: { status: 201 },
      });
      assert.strictEqual(waited[0], promise);
      await promise;
      assert(response.text.calledOnce);
      assert(logs.getCalls().some(({ args }) => args.join(' ').includes('body: (empty)')));
    });

    it('posts a file with the user token and registers with waitUntil', async () => {
      const waited = [];
      const daCtx = {
        org: 'myorg', key: 'mysite/folder/page.html', ext: 'html', waitUntil: (p) => waited.push(p),
      };
      const data = new File(['<body></body>'], 'source', { type: 'text/html' });
      const p = syncSourcePut({
        req: makeReq('Bearer tok1,Bearer tok2'), env, daCtx, obj: { data }, resp: { status: 201 },
      });
      assert.strictEqual(waited.length, 1);
      await p;
      assert.strictEqual(calls.length, 1);
      const { url, opts } = calls[0];
      assert.strictEqual(url, `${API}/myorg/sites/mysite/source/folder/page.html`);
      assert.strictEqual(opts.method, 'POST');
      assert.strictEqual(opts.headers.authorization, 'Bearer tok1');
      assert.strictEqual(opts.headers['x-content-source-authorization'], undefined);
      assert.strictEqual(opts.headers['content-type'], 'text/html');
      assert.strictEqual(new TextDecoder().decode(opts.body), '<body></body>');
    });

    it('maps to a different hlx6 site and encodes the path', async () => {
      const daCtx = { org: 'myorg', key: 'other/my folder/data.json', ext: 'json' };
      await syncSourcePut({
        req: makeReq(), env, daCtx, obj: { data: { a: 1 } }, resp: { status: 200 },
      });
      assert.strictEqual(calls[0].url, `${API}/org2/sites/site2/source/my%20folder/data.json`);
      assert.strictEqual(calls[0].opts.body, '{"a":1}');
      assert.strictEqual(calls[0].opts.headers['content-type'], 'application/json');
    });

    it('creates a folder when there is no object', async () => {
      const daCtx = { org: 'myorg', key: 'mysite/folder' };
      await syncSourcePut({
        req: makeReq(), env, daCtx, obj: undefined, resp: { status: 201 },
      });
      assert.strictEqual(calls[0].url, `${API}/myorg/sites/mysite/source/folder/`);
      assert.strictEqual(calls[0].opts.method, 'POST');
    });

    it('does nothing when not applicable', async () => {
      const obj = { data: 'x' };
      const base = { req: makeReq(), env, resp: { status: 201 } };
      assert.strictEqual(syncSourcePut({ ...base, daCtx: { org: 'myorg', key: 'nope/a.html' }, obj }), undefined);
      assert.strictEqual(syncSourcePut({ ...base, daCtx: { org: 'myorg', key: 'mysite' }, obj }), undefined);
      assert.strictEqual(syncSourcePut({
        ...base, resp: { status: 412 }, daCtx: { org: 'myorg', key: 'mysite/a.html' }, obj,
      }), undefined);
      assert.strictEqual(syncSourcePut({
        ...base, req: makeReq(null), daCtx: { org: 'myorg', key: 'mysite/a.html' }, obj,
      }), undefined);
      assert.strictEqual(syncSourcePut({ ...base, daCtx: { org: 'myorg', key: 'mysite/a.html' }, obj: {} }), undefined);
      assert.strictEqual(calls.length, 0);
    });

    it('logs and swallows failures', async () => {
      fetchStatus = () => 400;
      const daCtx = { org: 'myorg', key: 'mysite/a.html', ext: 'html' };
      await syncSourcePut({
        req: makeReq(), env, daCtx, obj: { data: '<body></body>' }, resp: { status: 201 },
      });
      assert(errors.getCalls().some(({ args }) => args.join(' ').includes('failed: 400')));
      assert.strictEqual(calls[0].opts.headers['content-type'], 'text/html');

      // failure with json body returned by api.aem.live
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        calls.push({ url: url.toString(), opts });
        return new Response(JSON.stringify({ message: 'Validation failed' }), {
          status: 400,
          headers: { 'content-type': 'application/json', 'x-error': 'Invalid HTML' },
        });
      };
      await syncSourcePut({
        req: makeReq(), env, daCtx, obj: { data: '<body></body>' }, resp: { status: 201 },
      });
      const output = errors.getCalls().map(({ args }) => args.join(' ')).join('\n');
      assert(output.includes('x-error: Invalid HTML'));
      assert(output.includes('body: {"message":"Validation failed"}'));

      const failure = new Error('network');
      globalThis.fetch = async () => {
        throw failure;
      };
      await syncSourcePut({
        req: makeReq(), env, daCtx, obj: { data: 'x' }, resp: { status: 201 },
      });
      assert(errors.getCalls().some(({ args }) => args[0].includes('propagation failed') && args[1] === failure));
      globalThis.fetch = origFetch;
    });

    describe('site root guards', () => {
      [['copy', syncCopy], ['move', syncMove]].forEach(([name, sync]) => {
        [
          { source: 'mysite', destination: 'mysite/destination' },
          { source: 'mysite/source', destination: 'mysite' },
        ].forEach((details) => {
          it(`skips ${name} with a site root: ${details.source} -> ${details.destination}`, () => {
            assert.strictEqual(sync({
              req: makeReq(), env, daCtx: { org: 'myorg' }, details, resp: { status: 204 },
            }), undefined);
            assert.strictEqual(calls.length, 0);
          });
        });
      });

      [['delete', syncSourceDelete], ['version', syncVersion]].forEach(([name, sync]) => {
        it(`skips ${name} at the site root`, () => {
          assert.strictEqual(sync({
            req: makeReq(), env, daCtx: { org: 'myorg', key: 'mysite' }, resp: { status: 201 },
          }), undefined);
          assert.strictEqual(calls.length, 0);
        });
      });

      it('skips versions when DA failed or the site is not migrated', () => {
        for (const [key, status] of [['mysite/a.html', 400], ['unmigrated/a.html', 201]]) {
          assert.strictEqual(syncVersion({
            req: makeReq(), env, daCtx: { org: 'myorg', key }, resp: { status },
          }), undefined);
        }
        assert.strictEqual(calls.length, 0);
      });
    });
  });

  describe('syncSourceDelete', () => {
    it('deletes files and folders', async () => {
      await syncSourceDelete({
        req: makeReq(), env, daCtx: { org: 'myorg', key: 'mysite/a.html', isFile: true }, details: {}, resp: { status: 204 },
      });
      await syncSourceDelete({
        req: makeReq(), env, daCtx: { org: 'myorg', key: 'mysite/folder', isFile: false }, details: {}, resp: { status: 206 },
      });
      assert.deepStrictEqual(calls.map((c) => [c.opts.method, c.url]), [
        ['DELETE', `${API}/myorg/sites/mysite/source/a.html`],
        ['DELETE', `${API}/myorg/sites/mysite/source/folder/`],
      ]);
    });

    it('ignores continuation requests', () => {
      const r = syncSourceDelete({
        req: makeReq(), env, daCtx: { org: 'myorg', key: 'mysite/folder' }, details: { continuationToken: 't' }, resp: { status: 204 },
      });
      assert.strictEqual(r, undefined);
    });
  });

  describe('syncCopy', () => {
    it('uses server side copy within the same hlx6 site', async () => {
      await syncCopy({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/a.html', isFile: true },
        details: { source: 'mysite/a.html', destination: 'mysite/b/a.html' },
        resp: { status: 204 },
      });
      await syncCopy({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'other/f', isFile: false },
        details: { source: 'other/f', destination: 'third/g' },
        resp: { status: 206 },
      });
      assert.deepStrictEqual(calls.map((c) => [c.opts.method, c.url]), [
        ['PUT', `${API}/myorg/sites/mysite/source/b/a.html?source=%2Fa.html&collision=overwrite`],
        ['PUT', `${API}/org2/sites/site2/source/g/?source=%2Ff%2F&collision=overwrite`],
      ]);
    });

    it('re-uploads files from DA across sites', async () => {
      const envWithBucket = {
        ...env,
        AEM_CONTENT: {
          get: async (key) => (key === 'myorg/mysite/b.html' ? {
            arrayBuffer: async () => new TextEncoder().encode('<body>hi</body>').buffer,
            httpMetadata: { contentType: 'text/html' },
          } : null),
        },
      };
      await syncCopy({
        req: makeReq(),
        env: envWithBucket,
        daCtx: { org: 'myorg', key: 'nope/a.html', isFile: true },
        details: { source: 'nope/a.html', destination: 'mysite/b.html' },
        resp: { status: 204 },
      });
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, `${API}/myorg/sites/mysite/source/b.html`);
      assert.strictEqual(calls[0].opts.method, 'POST');
      assert.strictEqual(calls[0].opts.headers['content-type'], 'text/html');

      // missing in DA bucket
      await syncCopy({
        req: makeReq(),
        env: envWithBucket,
        daCtx: { org: 'myorg', key: 'nope/a.html', isFile: true },
        details: { source: 'nope/a.html', destination: 'mysite/c.html' },
        resp: { status: 204 },
      });
      assert.strictEqual(calls.length, 1);
    });

    it('does not propagate cross-site folder copies, unmigrated destinations or continuations', async () => {
      await syncCopy({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'nope/f', isFile: false },
        details: { source: 'nope/f', destination: 'mysite/f' },
        resp: { status: 204 },
      });
      assert.strictEqual(syncCopy({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/a.html', isFile: true },
        details: { source: 'mysite/a.html', destination: 'nope/a.html' },
        resp: { status: 204 },
      }), undefined);
      assert.strictEqual(syncCopy({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/f' },
        details: { source: 'mysite/f', destination: 'mysite/g', continuationToken: 't' },
        resp: { status: 204 },
      }), undefined);
      assert.strictEqual(calls.length, 0);
    });
  });

  describe('syncMove', () => {
    it('waits for the copy response before deleting the source', async () => {
      let finishCopy;
      const copyResponse = new Promise((resolve) => {
        finishCopy = resolve;
      });
      globalThis.fetch = async (url, opts) => {
        calls.push({ url: url.toString(), opts });
        return opts.method === 'PUT' ? copyResponse : new Response(null, { status: 204 });
      };
      const promise = syncMove({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/a.html', isFile: true },
        details: { source: 'mysite/a.html', destination: 'mysite/b.html' },
        resp: { status: 204 },
      });
      assert.deepStrictEqual(calls.map(({ opts }) => opts.method), ['PUT']);
      finishCopy(new Response(null, { status: 201 }));
      await promise;
      assert.deepStrictEqual(calls.map(({ opts }) => opts.method), ['PUT', 'DELETE']);
    });

    it('copies then deletes within the same hlx6 site', async () => {
      await syncMove({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/a.html', isFile: true },
        details: { source: 'mysite/a.html', destination: 'mysite/b.html' },
        resp: { status: 204 },
      });
      assert.deepStrictEqual(calls.map((c) => [c.opts.method, c.url]), [
        ['PUT', `${API}/myorg/sites/mysite/source/b.html?source=%2Fa.html&collision=overwrite`],
        ['DELETE', `${API}/myorg/sites/mysite/source/a.html`],
      ]);
    });

    it('does not delete when the copy fails', async () => {
      fetchStatus = () => 500;
      await syncMove({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/f', isFile: false },
        details: { source: 'mysite/f', destination: 'mysite/g' },
        resp: { status: 204 },
      });
      assert.deepStrictEqual(calls.map((c) => c.opts.method), ['PUT']);
    });

    it('only deletes when moving out of a migrated site', async () => {
      await syncMove({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/f', isFile: false },
        details: { source: 'mysite/f', destination: 'nope/f' },
        resp: { status: 204 },
      });
      assert.deepStrictEqual(calls.map((c) => [c.opts.method, c.url]), [
        ['DELETE', `${API}/myorg/sites/mysite/source/f/`],
      ]);
    });

    it('does nothing when neither site is migrated or DA failed', () => {
      assert.strictEqual(syncMove({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'nope/a.html' },
        details: { source: 'nope/a.html', destination: 'nope2/a.html' },
        resp: { status: 204 },
      }), undefined);
      assert.strictEqual(syncMove({
        req: makeReq(),
        env,
        daCtx: { org: 'myorg', key: 'mysite/a.html' },
        details: { source: 'mysite/a.html', destination: 'mysite/b.html' },
        resp: { status: 500 },
      }), undefined);
    });
  });

  describe('syncVersion', () => {
    it('creates a version with the label as comment', async () => {
      await syncVersion({
        req: makeReq(), env, daCtx: { org: 'myorg', key: 'mysite/a.html' }, label: 'v 1', resp: { status: 201 },
      });
      await syncVersion({
        req: makeReq(), env, daCtx: { org: 'myorg', key: 'mysite/a.html' }, resp: { status: 201 },
      });
      assert.deepStrictEqual(calls.map((c) => [c.opts.method, c.url]), [
        ['POST', `${API}/myorg/sites/mysite/source/a.html/.versions?comment=v+1`],
        ['POST', `${API}/myorg/sites/mysite/source/a.html/.versions`],
      ]);
    });
  });
});
