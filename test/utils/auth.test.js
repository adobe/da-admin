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
import { getAclCtx, getUserActions, hasPermission, isAdmin } from '../../src/utils/auth.js';

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
    const DA_CONFIG = {
      'test': {
        "total": 1,
        "limit": 1,
        "offset": 0,
        "permissions": {
          "data": [
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

    it('test hasPermissions', async () => {
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');
      const key = '';

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/foo', 'write'));
    });

    it('test hasPermissions2', async () => {
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 8080}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({users, org: 'test', key: '/test', aclCtx}, 'test', 'write'));
      assert(hasPermission({users, org: 'test', key: '/test', aclCtx}, 'test', 'read'));
    });

    it('test hasPermissions3', async () => {
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}, {orgIdent: '2345B0EA551D747', ident: 8080}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');
      const key = '';

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
    });

    it('test hasPermissions4', async () => {
      const users = [{groups: []}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');
      const key = '';

      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
    });

    it('test hasPermissions5', async () => {
      const users = [{ident: '123',groups: []}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');
      const key = '';

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
    });
  });

  describe('ACL context', () => {
    it('get user actions', () => {
      const patharr = [
        {path: '/da-aem-boilerplate/authtest/sub/sub/*', actions: []},
        {path: '/da-aem-boilerplate/authtest/sub/*', actions: ['read', 'write']},
        {path: '/da-aem-boilerplate/authtest/*', actions: ['read']},
        {path: '/*', actions: ['read', 'write']},
        {path: '/', actions: ['read', 'write']},
      ];

      const pathlookup = new Map();
      pathlookup.set('joe@acme.com', patharr);

      const user = {
        email: 'joe@acme.com',
        ident: 'AAAA@bbb.e',
        groups: [
          {orgName: 'org1', orgIdent: 'ABCDEFG', ident: 123456, groupName: 'grp1'},
          {orgName: 'org2', orgIdent: 'ZZZZZZZ', ident: 77777, groupName: 'grp2'},
        ],
      };

      assert.deepStrictEqual(['read', 'write'],
        [...getUserActions(pathlookup, user, '/')]);
      assert.deepStrictEqual(['read'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub')]);
      assert.deepStrictEqual(['read'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/q.html')]);
      assert.deepStrictEqual(['read', 'write'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub/sub')]);
    });
  });

  it('get user actions2', () => {
    const patharr = [
      {path: '/da-aem-boilerplate/*', actions: ['read']},
      {path: '/da-aem-boilerplate', actions: ['read']},
      {path: '/somewhere', actions: ['read']},
      {path: '/foobar/+*', actions: []},
      {path: '/*', actions: ['read', 'write']},
      {path: '/', actions: ['read', 'write']},
    ];
    const pathlookup = new Map();
    pathlookup.set('joe@acme.com', patharr);
    const patharr2 = [
      {path: '/da-aem-boilerplate/authtest/myfile', actions: ['read']},
      {path: '/da-aem-boilerplate/authtest/*', actions: ['read', 'write']},
      {path: '/*', actions: []},
    ];
    pathlookup.set('ABCDEFG/123456', patharr2);

    const user = {
      email: 'joe@acme.com',
      ident: 'AAAA@bbb.e',
      groups: [
        {orgName: 'org1', orgIdent: 'ABCDEFG', ident: 123456, groupName: 'grp1'},
        {orgName: 'org2', orgIdent: 'ZZZZZZZ', ident: 77777, groupName: 'grp2'},
      ],
    };
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/')]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/foo')]);
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate')]);
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/somewhere')]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/somewhere/else')]);
    assert.deepStrictEqual([],
      [...getUserActions(pathlookup, user, '/foobar')]);
    assert.deepStrictEqual([],
      [...getUserActions(pathlookup, user, '/foobar/har')]);
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/myfile.html')]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/blah')]);
  });

  it('isAdmin', async () => {
    const props = {
      data: [
        { key: 'admin.role.all', value: 'joe@bloggs.org' },
        { key: 'admin.role.all', value: 'harry@bloggs.org' },
      ]
    }
    const DA_CONFIG = {
      get: (o, t) => {
        if ((o === 'myorg') && (t.type === 'json')) {
          return props;
        }
      },
    }
    const env = { DA_CONFIG };

    assert(!await isAdmin(env, 'myorg', []));
    assert(await isAdmin(env, 'myorg', [{email: 'joe@bloggs.org'}]));
    assert(await isAdmin(env, 'myorg', [{email: 'joe@bloggs.org'}, {email: 'harry@bloggs.org'}]));
    assert(!await isAdmin(env, 'myorg', [{email: 'joe@bloggs.org'}, {email: 'blah@bloggs.org'}]));
  });
});
