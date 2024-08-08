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
import assert from 'node:assert';
import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

import { putObjectWithVersion, postObjectVersion, putVersion } from '../../../src/storage/version/put.js';

describe('Version Put', () => {
  let mf;
  let mfEnv;
  beforeEach(async () => {
    mf = await getMiniflare();
    mfEnv = await mf.getBindings();
  });

  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  describe('putVersion', async () => {
    it ('saves if existing version is different', async () => {
      const daCtx = { org: 'myorg', ext:'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: '[{ "email": "foo@acme.com" }]',
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put(`myorg/.da-versions/${customMetadata.id}/${customMetadata.version}.html`, 'Original Body', {
        customMetadata,
        httpMetadata: { contentType: 'text/html' }
      });
      const update = {
        body: 'New Body',
        customMetadata: {
          id: customMetadata.id,
          version: crypto.randomUUID(),
          users: customMetadata.users,
          timestamp: `${Date.now()}`,
          path: customMetadata.path,
        },
        httpMetadata: { contentType: 'text/html' },
      }

      const version = await putVersion(mfEnv, daCtx, update);
      assert(version);
      assert.deepStrictEqual(version.customMetadata, update.customMetadata);
      assert.deepStrictEqual(version.httpMetadata, update.httpMetadata);
      const { objects }  = await mfEnv.DA_CONTENT.list({ prefix: 'myorg/.da-versions/' });
      assert.strictEqual(objects.length, 2);

    });

    it('does not save if existing version is the same && noneMatch === true (check for existing)', async () => {
      const daCtx = { org: 'myorg', ext:'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: '[{ "email": "foo@acme.com" }]',
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put(
        `myorg/.da-versions/${customMetadata.id}/${customMetadata.version}.html`,
        'Original Body',
        {
          customMetadata,
          httpMetadata: { contentType: 'text/html' }
        }
      );
      const update = {
        body: 'New Body',
        customMetadata: {
          id: customMetadata.id,
          version: customMetadata.version,
          users: customMetadata.users,
          timestamp: `${Date.now()}`,
          path: customMetadata.path,
        },
        httpMetadata: { contentType: 'text/html' },
      }

      const obj = await mfEnv.DA_CONTENT.get(`myorg/.da-versions/${update.customMetadata.id}/${update.customMetadata.version}.html`);
      assert(obj);
      const version = await putVersion(mfEnv, daCtx, update);
      assert.ifError(version);
    });

    it ('saves if version exists && noneMatch === false (do not check for existing)', async () => {
      const daCtx = { org: 'myorg', ext:'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: '[{ "email": "foo@acme.com" }]',
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put(
        `myorg/.da-versions/${customMetadata.id}/${customMetadata.version}.html`,
        'Original Body',
        {
          customMetadata,
          httpMetadata: { contentType: 'text/html' }
        }
      );
      const update = {
        body: 'New Body',
        customMetadata: {
          id: customMetadata.id,
          version: customMetadata.version,
          users: customMetadata.users,
          timestamp: `${Date.now()}`,
          path: customMetadata.path,
        },
        httpMetadata: { contentType: 'text/html' },
      }

      const obj = await mfEnv.DA_CONTENT.get(`myorg/.da-versions/${update.customMetadata.id}/${update.customMetadata.version}.html`);
      assert(obj);
      const version = await putVersion(mfEnv, daCtx, update, false);
      assert(version);
    });
  });

  describe('putObjectWithVersion', async () => {
    it('it supports first time save', async () => {
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            assert.strictEqual(k, 'myorg/a/b/c');
            assert.strictEqual(v, 'haha');
            const metadata = opts.customMetadata;
            assert(metadata.id, 'ID should be set');
            assert(metadata.version, 'Version should be set');
            assert.strictEqual(metadata.users, '[{"email":"anonymous"}]');
            assert(metadata.timestamp, 'Timestamp should be set');
            assert.strictEqual(metadata.path, 'a/b/c');
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      }

      const daCtx = { org: 'myorg', users: [{ email: 'anonymous' }] };
      const update = { org: 'myorg', key: 'a/b/c', body: 'haha', type: 'text/html' };
      const resp = await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(resp, 201);

      const r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      assert(r2o);
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.strictEqual(metadata.users, '[{"email":"anonymous"}]');
      assert(metadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');
    });

    it('it retries on "new" document but save collision', async () => {
      // Not really sure how this could be possible - but essentially the idea is that the first
      // time through there's no "current" object, but when we try to save the new object, we get a
      // collision error. The second time through there is still no "current" document, but the save works.
      let firstCall = true;
      let numCalls = 0;
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            numCalls += 1;
            if (firstCall) {
              firstCall = false;
              return null;
            }
            assert.strictEqual(k, 'myorg/a/b/c');
            assert.strictEqual(v, 'haha');
            const metadata = opts.customMetadata;
            assert(metadata.id, 'ID should be set');
            assert(metadata.version, 'Version should be set');
            assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
            assert(metadata.timestamp, 'Timestamp should be set');
            assert.strictEqual(metadata.path, 'a/b/c');
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      }

      const update = { org: 'myorg', key: 'a/b/c', body: 'haha', type: 'text/html' };
      const daCtx = { org: 'myorg', users: [{ email: 'foo@acme.com' }], ext: 'html' };
      const resp = await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(resp, 201);
      assert.strictEqual(numCalls, 2);
      const r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      assert(r2o);
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
      assert(metadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');
    });

    it('it retries on existing document but etag changed (save race condition)', async () => {
      // Prepare existing data
      const daCtx = { org: 'myorg', users: [{ email: 'foo@acme.com' }], ext: 'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: JSON.stringify(daCtx.users),
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put('myorg/a/b/c', 'Original Body', {
        customMetadata,
        httpMetadata: { contentType: 'text/html' }
      });

      let firstCall = true;
      const calls = {};
      const versions = []
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            if (k.startsWith('myorg/.da-versions')) {
              versions.push(k);
            }
            calls[k] = calls[k] ? calls[k] + 1 : 1;
            if (k === 'myorg/a/b/c' && firstCall) {
              firstCall = false;
              delete opts.customMetadata.preparsingstore;
              await mfEnv.DA_CONTENT.put(k, 'Race Body', opts);
            }
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      };


      const update = { org: 'myorg', key: 'a/b/c', body: 'New Body', type: 'text/html' };
      const resp = await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(resp, 201);
      assert.strictEqual(calls['myorg/a/b/c'], 2);
      const keys = Object.keys(calls);
      assert.strictEqual(keys.length, 3);
      let r2o = await mfEnv.DA_CONTENT.get(versions[0]);
      let content = await r2o.text();
      assert.strictEqual(content, 'Original Body');
      assert.strictEqual(r2o.customMetadata.label, 'Collab Parse');
      r2o = await mfEnv.DA_CONTENT.get(versions[1]);
      content = await r2o.text();
      assert.strictEqual(content, 'Race Body');
      r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      content = await r2o.text();
      assert.strictEqual(content, 'New Body');
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
      assert(metadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');
      assert.strictEqual(metadata.preparsingstore, metadata.timestamp);
    });

    it('it saves version body due to no preparsing store', async () => {
      // Prepare existing data
      const daCtx = { org: 'myorg', users: [{ email: 'foo@acme.com' }], ext: 'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: JSON.stringify(daCtx.users),
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put('myorg/a/b/c', 'Original Body', {
        customMetadata,
        httpMetadata: { contentType: 'text/html' }
      });
      const versions = [];
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            if (k.startsWith('myorg/.da-versions')) {
              versions.push(k);
            }
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      }

      const update = { org: 'myorg', key: 'a/b/c', body: 'New Body', type: 'text/html' };
      const resp = await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(resp, 201);

      const r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      assert(r2o);
      const body = await r2o.text();
      assert.strictEqual(body, 'New Body');
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.notEqual(metadata.version, customMetadata.version);
      assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
      assert(metadata.timestamp);
      assert.notEqual(metadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');

      assert.strictEqual(versions.length, 1);
      const version = await mfEnv.DA_CONTENT.get(versions[0]);
      const versionBody = await version.text();
      assert.strictEqual(versionBody, 'Original Body');
      const versionMetadata = version.customMetadata;
      assert.strictEqual(version.httpMetadata.contentType, 'text/html');
      assert.strictEqual(versionMetadata.id, customMetadata.id);
      assert.strictEqual(versionMetadata.version, customMetadata.version);
      assert.strictEqual(versionMetadata.users, customMetadata.users);
      assert.strictEqual(versionMetadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(versionMetadata.path, customMetadata.path);
      assert.strictEqual(versionMetadata.label, 'Collab Parse');
    });

    it('it saves version body due to force flag', async () => {
      const daCtx = { org: 'myorg', users: [{ email: 'foo@acme.com' }], ext: 'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: JSON.stringify(daCtx.users),
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put('myorg/a/b/c', 'Original Body', {
        customMetadata,
        httpMetadata: { contentType: 'text/html' }
      });
      const versions = [];
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            if (k.startsWith('myorg/.da-versions')) {
              versions.push(k);
            }
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      }
      const update = { org: 'myorg', key: 'a/b/c', body: 'New Body', type: 'text/html', label: 'Test Case' };
      const resp = await putObjectWithVersion(env, daCtx, update, true);
      assert.strictEqual(resp, 201);

      const r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      assert(r2o);
      const body = await r2o.text();
      assert.strictEqual(body, 'New Body');
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.notEqual(metadata.version, customMetadata.version);
      assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
      assert(metadata.timestamp);
      assert.notEqual(metadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');

      assert.strictEqual(versions.length, 1);
      const version = await mfEnv.DA_CONTENT.get(versions[0]);
      const versionBody = await version.text();
      assert.strictEqual(versionBody, 'Original Body');
      const versionMetadata = version.customMetadata;
      assert.strictEqual(version.httpMetadata.contentType, 'text/html');
      assert.strictEqual(versionMetadata.id, customMetadata.id);
      assert.strictEqual(versionMetadata.version, customMetadata.version);
      assert.strictEqual(versionMetadata.users, customMetadata.users);
      assert.strictEqual(versionMetadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(versionMetadata.path, customMetadata.path);
      assert.strictEqual(versionMetadata.label, 'Test Case');
    });

    it('it does saves version body due to force flag', async () => {
      const daCtx = { org: 'myorg', users: [{ email: 'foo@acme.com' }], ext: 'html' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: JSON.stringify(daCtx.users),
        timestamp: `${Date.now()}`,
        preparsingstore: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put('myorg/a/b/c', 'Original Body', {
        customMetadata,
        httpMetadata: { contentType: 'text/html' }
      });
      const versions = [];
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            if (k.startsWith('myorg/.da-versions')) {
              versions.push(k);
            }
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      }
      const update = { org: 'myorg', key: 'a/b/c', body: 'New Body', type: 'text/html', label: 'Test Case' };
      const resp = await putObjectWithVersion(env, daCtx, update, false);
      assert.strictEqual(resp, 201);

      const r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      assert(r2o);
      const body = await r2o.text();
      assert.strictEqual(body, 'New Body');
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.notEqual(metadata.version, customMetadata.version);
      assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
      assert(metadata.timestamp);
      assert.notEqual(metadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');

      assert.strictEqual(versions.length, 1);
      const version = await mfEnv.DA_CONTENT.get(versions[0]);
      const versionBody = await version.text();
      assert.strictEqual(versionBody, '');
      const versionMetadata = version.customMetadata;
      assert.strictEqual(version.httpMetadata.contentType, 'text/html');
      assert.strictEqual(versionMetadata.id, customMetadata.id);
      assert.strictEqual(versionMetadata.version, customMetadata.version);
      assert.strictEqual(versionMetadata.users, customMetadata.users);
      assert.strictEqual(versionMetadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(versionMetadata.path, customMetadata.path);
      assert.strictEqual(versionMetadata.label, 'Test Case');
    });

  });

  describe('postObjectVersion', () => {
    it('creates an object version', async () => {
      const req = {
        json: () => ({
          label: 'foobar'
        })
      };
      // Prepare existing data
      const daCtx = { org: 'myorg', users: [{ email: 'foo@acme.com' }], ext: 'html', key: 'a/b/c' };
      const customMetadata = {
        id: crypto.randomUUID(),
        version: crypto.randomUUID(),
        users: JSON.stringify(daCtx.users),
        timestamp: `${Date.now()}`,
        path: 'a/b/c',
      }
      await mfEnv.DA_CONTENT.put('myorg/a/b/c', 'Original Body', {
        customMetadata,
        httpMetadata: { contentType: 'text/html' }
      });
      const versions = [];
      const env = {
        DA_CONTENT: {
          put: async (k, v, opts) => {
            if (k.startsWith('myorg/.da-versions')) {
              versions.push(k);
            }
            return mfEnv.DA_CONTENT.put(k, v, opts);
          },
          get: async (k) => {
            return mfEnv.DA_CONTENT.get(k);
          },
          head: async (k) => {
            return mfEnv.DA_CONTENT.head(k);
          }
        }
      }

      const resp = await postObjectVersion(req, env, daCtx);
      assert.strictEqual(resp.status, 201);

      const r2o = await mfEnv.DA_CONTENT.get('myorg/a/b/c');
      assert(r2o);
      const body = await r2o.text();
      assert.strictEqual(body, 'Original Body');
      const metadata = r2o.customMetadata;
      assert.strictEqual(r2o.httpMetadata.contentType, 'text/html');
      assert(metadata.id);
      assert(metadata.version);
      assert.notEqual(metadata.version, customMetadata.version);
      assert.strictEqual(metadata.users, '[{"email":"foo@acme.com"}]');
      assert(metadata.timestamp);
      assert.notEqual(metadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(metadata.path, 'a/b/c');

      assert.strictEqual(versions.length, 1);
      const version = await mfEnv.DA_CONTENT.get(versions[0]);
      const versionBody = await version.text();
      assert.strictEqual(versionBody, 'Original Body');
      const versionMetadata = version.customMetadata;
      assert.strictEqual(version.httpMetadata.contentType, 'text/html');
      assert.strictEqual(versionMetadata.id, customMetadata.id);
      assert.strictEqual(versionMetadata.version, customMetadata.version);
      assert.strictEqual(versionMetadata.users, customMetadata.users);
      assert.strictEqual(versionMetadata.timestamp, customMetadata.timestamp);
      assert.strictEqual(versionMetadata.path, customMetadata.path);
      assert.strictEqual(versionMetadata.label, 'foobar');
    });
  });
});
