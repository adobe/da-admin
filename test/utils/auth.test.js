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

// Mocks
import reqs from './mocks/req.js';
import env from './mocks/env.js';
import jose from './mocks/jose.js';
import fetch from './mocks/fetch.js';
import { hasPermission } from '../../src/utils/auth.js';

// ES Mocks
const {
  isAuthorized,
  setUser,
  getUsers,
} = await esmock('../../src/utils/auth.js', { jose, import: { fetch } });

describe('DA auth', () => {
  describe('is authorized', async () => {
    // There's nothing to protect if there is no org in the request
    it('authorized if no org', async () => {
      const authorized = await isAuthorized(env);
      assert.strictEqual(authorized, true);
    });

    it('authorized if no namespace entry', async () => {
      const authed = await isAuthorized(env, 'wknd', { email: 'aparker@geometrixx.info' });
      assert.strictEqual(authed, true);
    });

    it('authorized if no protections', async () => {
      const authed = await isAuthorized(env, 'beagle', { email: 'chad@geometrixx.info' });
      assert.strictEqual(authed, true);
    });

    it('authorized if org and user match', async () => {
      const authed = await isAuthorized(env, 'geometrixx', { email: 'aparker@geometrixx.info' });
      assert.strictEqual(authed, true);
    });

    it('authorized if org and user match - case insensitive', async () => {
      const authed = await isAuthorized(env, 'geometrixx', { email: 'ApaRkeR@geometrixx.info' });
      assert.strictEqual(authed, true);
    });

    it('not authorized no user match', async () => {
      const authed = await isAuthorized(env, 'geometrixx', { email: 'chad@geometrixx.info' });
      assert.strictEqual(authed, false);
    });

    it('authorization multi sheet config', async () => {
      const DA_CONFIG = {
        'geometrixx': {
          "total": 1,
          "limit": 1,
          "offset": 0,
          "data": {
            "data": [
              {
                "key": "admin.role.all",
                "value": "aPaRKer@Geometrixx.Info"
              }
            ],
            "otherdata": [
              {
                "key": "foo",
                "value": "bar"
              }
            ],
          },
          ":type": "multi-sheet"
        }
      };
      const env2 = {
        DA_CONFIG: {
          get: (name) => {
            return DA_CONFIG[name];
          },
        }
      };

      assert(await isAuthorized(env2, 'wknd', { email: 'aparker@geometrixx.info' }));
      assert(await isAuthorized(env2, 'geometrixx', { email: 'aparker@geometrixx.info' }));
      assert(await isAuthorized(env, 'geometrixx', { email: 'ApaRkeR@geometrixx.info' }));
      assert(!await isAuthorized(env, 'geometrixx', { email: 'chad@geometrixx.info' }));
    });
  });

  describe('get user', async () => {
    it('anonymous with no auth header', async () => {
      const users = await getUsers(reqs.org, env);
      assert.strictEqual(users[0].email, 'anonymous');
    });

    it('anonymous with empty auth', async () => {
      const users = await getUsers(reqs.file, env);
      assert.strictEqual(users[0].email, 'anonymous');
    });

    it('anonymous if expired', async () => {
      const users = await getUsers(reqs.folder, env);
      assert.strictEqual(users[0].email, 'anonymous');
    });

    it('authorized if email matches', async () => {
      const users = await getUsers(reqs.site, env);
      assert.strictEqual(users[0].email, 'aparker@geometrixx.info');
    });

    it('authorized with user if email matches and anonymous if present', async () => {
      const users = await getUsers(reqs.siteMulti, env);
      assert.strictEqual(users[0].email, 'anonymous')
      assert.strictEqual(users[1].email, 'aparker@geometrixx.info');
    });

    it('anonymous if ims fails', async () => {
      const users = await getUsers(reqs.media, env);
      assert.strictEqual(users[0].email, 'anonymous');
    });
  });

  describe('set user', async () => {
    it('sets user', async () => {
      const headers = new Headers({
        'Authorization': `Bearer aparker@geometrixx.info`,
      });

      const userValue = await setUser('aparker@geometrixx.info', 100, headers, env);
      assert.strictEqual(userValue, '{"email":"aparker@geometrixx.info","ident":"123","groups":[{"orgName":"Org1","orgIdent":"2345B0EA551D747","groupName":"READ_WRITE_STANDARD@DEV","groupDisplayName":"READ_WRITE_STANDARD@DEV","ident":4711},{"orgName":"Org1","orgIdent":"2345B0EA551D747","groupName":"READ_ONLY_STANDARD@PROD","groupDisplayName":"READ_ONLY_STANDARD@PROD","ident":8080},{"orgName":"ACME Inc.","orgIdent":"EE23423423423","groupName":"Emp","groupDisplayName":"Emp","ident":12312312},{"orgName":"ACME Inc.","orgIdent":"EE23423423423","groupName":"org-test","groupDisplayName":"org-test","ident":34243}]}');
    });
  });

  describe('path authorization', async () =>  {
    it('test hasPermissions', async () => {
      const DA_CONFIG = {
        'test': {
          "total": 1,
          "limit": 1,
          "offset": 0,
          "data": {
            "permissions": [
              {
                "path": "/*",
                "groups": "2345B0EA551D747/4711,123",
                "actions": "read",
              },
              {
                "path": "/*",
                "groups": "2345B0EA551D747/8080",
                "actions": "write",
              },
              {
                "path": "/foo",
                "groups": "2345B0EA551D747/4711",
                "actions": "write",
              }
            ]
          },
          ":type": "multi-sheet"
        }
      };
      const env2 = {
        DA_CONFIG: {
          get: (name) => {
            return DA_CONFIG[name];
          },
        }
      };
      assert(await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}], org: 'test',  env: env2 }, '/test', 'read'));
      assert(!await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}], org: 'test',  env: env2 }, '/test', 'write'));
      assert(await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}], org: 'test',  env: env2 }, '/foo', 'write'));
      assert(!await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}],  org: 'test', env: env2 }, '/test', 'write'));
      assert(await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 8080}]}],  org: 'test', env: env2 }, '/test', 'write'));
      assert(await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 8080}]}],  org: 'test', env: env2 }, '/test', 'read'));
      assert(await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}, {orgIdent: '2345B0EA551D747', ident: 8080}]}],  org: 'test', env: env2 }, '/test', 'read'));
      assert(await hasPermission({ users: [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}, {orgIdent: '2345B0EA551D747', ident: 8080}]}],  org: 'test', env: env2 }, '/test', 'write'));
      assert(!await hasPermission({ users: [{groups: []}],  org: 'test', env: env2 }, '/test', 'read'));
      assert(await hasPermission({ users: [{ident: '123',groups: []}],  org: 'test', env: env2 }, '/test', 'read'));
      assert(!await hasPermission({ users: [{ident: '123',groups: []}],  org: 'test', env: env2 }, '/test', 'write'));
    });
 });
});
