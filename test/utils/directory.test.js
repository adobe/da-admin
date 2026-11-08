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
import {
  getOrgUsers, connectOrg, disconnectOrg, isConnected, DirectoryNotConnected,
} from '../../src/utils/directory.js';
import { seal } from '../../src/utils/secret-box.js';

const ORG = '2345B0EA551D747';
const KEY = Buffer.alloc(32, 7).toString('base64');
const CRED = { clientId: 'cid', clientSecret: 'secret' };

function kvMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  const puts = [];
  return {
    puts,
    store,
    get: async (key, opts) => {
      const v = store.get(key);
      return v && opts?.type === 'json' ? JSON.parse(v) : (v ?? null);
    },
    put: async (key, value, opts) => {
      puts.push({ key, value, opts });
      store.set(key, value);
    },
    delete: async (key) => { store.delete(key); },
  };
}

const baseEnv = async ({ connected = true } = {}) => ({
  IMS_ORIGIN: 'https://ims',
  DIRECTORY_ENCRYPTION_KEY: KEY,
  DA_AUTH: kvMock(connected ? { [`directory-cred:${ORG}`]: await seal(KEY, CRED) } : {}),
});

const tokenResp = () => ({ ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3599 }) });
const usersResp = (page, lastPage = true) => ({
  ok: true,
  status: 200,
  json: async () => ({
    lastPage,
    users: [{
      email: `u${page}@example.com`, firstname: 'U', lastname: `${page}`, groups: ['G'],
    }],
  }),
});

describe('Directory', () => {
  let origFetch;
  let calls;
  beforeEach(() => {
    origFetch = globalThis.fetch;
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  const mockFetch = (handler) => {
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, body: opts?.body?.toString(), headers: opts?.headers });
      return handler(url);
    };
  };

  describe('getOrgUsers', () => {
    it('uses the org credential, pages through users, and caches both', async () => {
      mockFetch((url) => {
        if (url.endsWith('/ims/token/v3')) return tokenResp();
        const page = Number(new URL(url).pathname.split('/').pop());
        return usersResp(page, page === 1);
      });
      const env = await baseEnv();

      const users = await getOrgUsers(env, ORG);

      assert.deepStrictEqual(users, [
        { email: 'u0@example.com', name: 'U 0', groups: ['G'] },
        { email: 'u1@example.com', name: 'U 1', groups: ['G'] },
      ]);
      const body = new URLSearchParams(calls[0].body);
      assert.strictEqual(calls[0].url, 'https://ims/ims/token/v3');
      assert.strictEqual(body.get('grant_type'), 'client_credentials');
      assert.strictEqual(body.get('client_id'), 'cid');
      assert.strictEqual(body.get('client_secret'), 'secret');
      assert.strictEqual(body.get('scope'), 'openid,AdobeID,user_management_sdk');
      assert.strictEqual(body.get('org_id'), null);
      assert.deepStrictEqual(calls.slice(1).map((c) => c.url), [
        `https://usermanagement.adobe.io/v2/usermanagement/users/${ORG}@AdobeOrg/0?directOnly=false`,
        `https://usermanagement.adobe.io/v2/usermanagement/users/${ORG}@AdobeOrg/1?directOnly=false`,
      ]);
      assert.strictEqual(calls[1].headers['X-Api-Key'], 'cid');
      const tokenPut = env.DA_AUTH.puts.find((p) => p.key === `directory-token:${ORG}`);
      assert.strictEqual(tokenPut.opts.expirationTtl, 3299);

      calls.length = 0;
      await getOrgUsers(env, ORG);
      assert.deepStrictEqual(calls, []);
    });

    it('is not connected without a stored credential', async () => {
      mockFetch(() => Promise.reject(new Error('no network')));
      const env = await baseEnv({ connected: false });
      await assert.rejects(() => getOrgUsers(env, ORG), DirectoryNotConnected);
    });

    it('marks a rejected credential off briefly but keeps it', async () => {
      mockFetch(() => ({ ok: false, status: 401 }));
      const env = await baseEnv();

      await assert.rejects(() => getOrgUsers(env, ORG), DirectoryNotConnected);
      await assert.rejects(() => getOrgUsers(env, ORG), DirectoryNotConnected);

      assert.strictEqual(calls.length, 1);
      const offPut = env.DA_AUTH.puts.find((p) => p.key === `directory-off:${ORG}`);
      assert.strictEqual(offPut.opts.expirationTtl, 600);
      assert.ok(env.DA_AUTH.store.has(`directory-cred:${ORG}`));
      assert.strictEqual(await isConnected(env, ORG), false);
    });

    it('does not mark an org off on an IMS outage', async () => {
      mockFetch(() => ({ ok: false, status: 503 }));
      const env = await baseEnv();

      const notOff = (e) => !(e instanceof DirectoryNotConnected);
      await assert.rejects(() => getOrgUsers(env, ORG), notOff);
      assert.strictEqual(env.DA_AUTH.puts.length, 0);
    });
  });

  describe('connectOrg', () => {
    it('stores the credential encrypted once it can list the org', async () => {
      mockFetch((url) => (url.endsWith('/ims/token/v3') ? tokenResp() : usersResp(0)));
      const env = await baseEnv({ connected: false });
      env.DA_AUTH.store.set(`directory-off:${ORG}`, '1');
      env.DA_AUTH.store.set(`org-users:${ORG}`, '[]');

      assert.deepStrictEqual(await connectOrg(env, ORG, CRED), { connected: true });

      const sealed = env.DA_AUTH.store.get(`directory-cred:${ORG}`);
      assert.doesNotMatch(sealed, /secret/);
      assert.strictEqual(env.DA_AUTH.store.has(`directory-off:${ORG}`), false);
      assert.strictEqual(env.DA_AUTH.store.has(`org-users:${ORG}`), false);
      assert.strictEqual(await isConnected(env, ORG), true);
      const users = await getOrgUsers(env, ORG);
      assert.deepStrictEqual(users, [{ email: 'u0@example.com', name: 'U 0', groups: ['G'] }]);
    });

    it('rejects a credential IMS refuses', async () => {
      mockFetch(() => ({ ok: false, status: 400 }));
      const env = await baseEnv({ connected: false });
      assert.deepStrictEqual(await connectOrg(env, ORG, CRED), { error: 'invalid_credentials' });
      assert.strictEqual(env.DA_AUTH.store.size, 0);
    });

    it('rejects a credential from another org', async () => {
      mockFetch((url) => (url.endsWith('/ims/token/v3') ? tokenResp() : { ok: false, status: 403 }));
      const env = await baseEnv({ connected: false });
      assert.deepStrictEqual(await connectOrg(env, ORG, CRED), { error: 'wrong_org' });
      assert.strictEqual(env.DA_AUTH.store.size, 0);
    });

    it('throws on an upstream outage without storing anything', async () => {
      mockFetch((url) => (url.endsWith('/ims/token/v3') ? tokenResp() : { ok: false, status: 500 }));
      const env = await baseEnv({ connected: false });
      await assert.rejects(() => connectOrg(env, ORG, CRED), /directory 500/);
      assert.strictEqual(env.DA_AUTH.store.size, 0);
    });
  });

  describe('disconnectOrg', () => {
    it('removes the credential, token, marker, and cached people', async () => {
      const env = await baseEnv();
      ['directory-token', 'directory-off', 'org-users'].forEach((k) => env.DA_AUTH.store.set(`${k}:${ORG}`, 'x'));
      env.DA_AUTH.store.set('directory-cred:OTHER', 'keep');

      await disconnectOrg(env, ORG);

      assert.deepStrictEqual([...env.DA_AUTH.store.keys()], ['directory-cred:OTHER']);
      assert.strictEqual(await isConnected(env, ORG), false);
    });
  });
});
