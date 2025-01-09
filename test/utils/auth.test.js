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
  setUser,
  getUsers,
} = await esmock('../../src/utils/auth.js', { jose, import: { fetch } });

describe('DA auth', () => {
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
              "groups": "2345B0EA551D747/4711,123,joe@bloggs.org",
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
            },
            {
              "path": "/bar/ + *",
              "groups": "2345B0EA551D747/4711",
              "actions": "write",
            },
            {
              "path": "/",
              "groups": "2345B0EA551D747/4711",
              "actions": "write",
            },
            {
              "path": "/furb/",
              "groups": "2345B0EA551D747/4711",
              "actions": "write",
            },
            {
              "path": "ACLTRACE",
              "groups": "joe@bloggs.org",
              "actions": "read",
            },
            {
              "path": "CONFIG",
              "groups": "123",
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

    it('test anonymous permissions', async () => {
      const users = [{email: 'anonymous'}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(!hasPermission({users, org: 'test', aclCtx, key: ''}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: ''}, '/test', 'write'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: '/test'}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: '/test'}, '/test', 'write'));
    });

    it('test hasPermissions', async () => {
      const key = '';
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/foo', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/bar', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/bar/something.jpg', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/flob', 'read'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/furb', 'write'));
    });

    it('test hasPermissions2', async () => {
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 8080}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({users, org: 'test', key: '/test', aclCtx}, 'test', 'write'));
      assert(hasPermission({users, org: 'test', key: '/test', aclCtx}, 'test', 'read'));
    });

    it('test hasPermissions3', async () => {
      const key = '/test';
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}, {orgIdent: '2345B0EA551D747', ident: 8080}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
    });

    it('test hasPermissions4', async () => {
      const key = '';
      const users = [{groups: []}];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
    });

    it('test hasPermissions5', async () => {
      const key = '';
      const users = [{ident: '123',groups: []}];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
    });

    it('test hasPermissions6', async () => {
      const users = [{email: 'joe@bloggs.org', groups: []}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({users, org: 'test', aclCtx, key: ''}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: ''}, '/test', 'write'));
      assert(hasPermission({users, org: 'test', aclCtx, key: '/test'}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: '/test'}, '/test', 'write'));
    });

    it('test trace information', async () => {
      const users = [{email: 'joe@bloggs.org', groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/bar/blah.html');
      const trace = aclCtx.actionTrace;

      assert.strictEqual(2, trace.length);
      const emailTraceIdx = trace[0].group === 'joe@bloggs.org' ? 0 : 1
      const groupTraceIdx = 1 - emailTraceIdx;
      assert.deepStrictEqual({group: 'joe@bloggs.org', path: '/*', actions: ['read']}, trace[emailTraceIdx]);
      assert.deepStrictEqual(
        {
          group: '2345B0EA551D747/4711',
          path: '/bar/+*',
          actions: [ 'read', 'write' ]
        }, trace[groupTraceIdx]);
    });

    it('test CONFIG api', async () => {
      const users = [{ident: "123"}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/', 'config');

      assert(hasPermission({users, org: 'test', aclCtx, key: ''}, 'CONFIG', 'write', true));
      assert(hasPermission({users, org: 'test', aclCtx, key: '/somewhere'}, 'CONFIG', 'write', true));
    });
  });

  describe('persmissions single sheet', () => {
    const DA_CONFIG = {
      'test': {
        "data": [
          {
            "path": "/*",
            "groups": "2345B0EA551D747/4711,123,joe@bloggs.org",
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
          },
          {
            "path": "/bar/ + *",
            "groups": "2345B0EA551D747/4711",
            "actions": "write",
          },
          {
            "path": "/",
            "groups": "2345B0EA551D747/4711",
            "actions": "write",
          },
          {
            "path": "/furb/",
            "groups": "2345B0EA551D747/4711",
            "actions": "write",
          },
        ],
        ":type": "sheet",
        ":sheetname": "permissions",
      }
    };

    const env = {
      DA_CONFIG: {
        get: (name) => {
          return DA_CONFIG[name];
        },
      }
    };

    it('test anonymous permissions', async () => {
      const users = [{email: 'anonymous'}];
      const aclCtx = await getAclCtx(env, 'test', users, '/test');

      assert(!hasPermission({users, org: 'test', aclCtx, key: ''}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: ''}, '/test', 'write'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: '/test'}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key: '/test'}, '/test', 'write'));
    });

    it('test hasPermissions', async () => {
      const key = '';
      const users = [{groups: [{orgIdent: '2345B0EA551D747', ident: 4711}]}];
      const aclCtx = await getAclCtx(env, 'test', users, key);

      assert(hasPermission({users, org: 'test', aclCtx, key}, '/test', 'read'));
      assert(!hasPermission({users, org: 'test', aclCtx, key}, '/test', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/foo', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/bar', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/bar/something.jpg', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/', 'write'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/flob', 'read'));
      assert(hasPermission({ users, org: 'test', aclCtx, key}, '/furb', 'write'));
    });
  });

  it('test getAclCtx missing props', async () => {
    const aclCtx = await getAclCtx({}, 'myorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 0);
    assert(aclCtx.actionSet.has('read'));
    assert(aclCtx.actionSet.has('write'));
  });

  it('test getAclCtx missing props2', async () => {
    const cfgGet = (o, t) => {
      if ((o === 'myorg') && (t.type === 'json')) {
        return {};
      }
    };
    const DA_CONFIG = { get: cfgGet };
    const env = { DA_CONFIG };

    const aclCtx = await getAclCtx(env, 'myorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 0);
    assert(aclCtx.actionSet.has('read'));
    assert(aclCtx.actionSet.has('write'));
  });

  it('test getAclCtx missing props3', async () => {
    const cfgGet = (o, t) => {
      if ((o === 'someorg') && (t.type === 'json')) {
        return { permissions: {}};
      }
    };
    const DA_CONFIG = { get: cfgGet };
    const env = { DA_CONFIG };

    const aclCtx = await getAclCtx(env, 'someorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 0);
    assert(aclCtx.actionSet.has('read'));
    assert(aclCtx.actionSet.has('write'));
  });

  it('test incorrect props doesnt break things', async () => {
    const data = [{ groups: 'abc', actions: 'read' }];
    const permissions = { data };
    const cfgGet = (o, t) => {
      if ((o === 'someorg') && (t.type === 'json')) {
        return { permissions };
      }
    };
    const DA_CONFIG = { get: cfgGet };
    const env = { DA_CONFIG };

    const aclCtx = await getAclCtx(env, 'someorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 0);
    assert.strictEqual(aclCtx.actionSet.size, 0);
  });

  it('test incorrect props doesnt break things', async () => {
    const data = [{ path: '/abc', actions: 'read' }];
    const permissions = { data };
    const cfgGet = (o, t) => {
      if ((o === 'someorg') && (t.type === 'json')) {
        return { permissions };
      }
    };
    const DA_CONFIG = { get: cfgGet };
    const env = { DA_CONFIG };

    const aclCtx = await getAclCtx(env, 'someorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 0);
    assert.strictEqual(aclCtx.actionSet.size, 0);
  });

  it('test correct props', async () => {
    const data = [{ path: '/abc', groups: 'a ha, b hoo', actions: 'read' }];
    const permissions = { data };
    const cfgGet = (o, t) => {
      if ((o === 'someorg') && (t.type === 'json')) {
        return { permissions };
      }
    };
    const DA_CONFIG = { get: cfgGet };
    const env = { DA_CONFIG };

    const aclCtx = await getAclCtx(env, 'someorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 2);

    const p1 = aclCtx.pathLookup.get('a ha');
    const p2 = aclCtx.pathLookup.get('b hoo');

    assert.strictEqual(p1.length, 1);
    assert.strictEqual(p1[0].path, '/abc');
    assert.deepStrictEqual(p1[0].actions, ['read']);
    assert.strictEqual(p2.length, 1);
    assert.strictEqual(p2[0].path, '/abc');
    assert.deepStrictEqual(p2[0].actions, ['read']);

    assert.strictEqual(aclCtx.actionSet.size, 0);
  });

  describe('ACL context', () => {
    it('get user actions', () => {
      const patharr = [
        {path: '/da-aem-boilerplate/authtest/sub/sub/*', actions: []},
        {path: '/da-aem-boilerplate/authtest/sub/*', actions: ['read', 'write']},
        {path: '/da-aem-boilerplate/authtest/*', actions: ['read']},
        {path: '/*', actions: ['read', 'write']},
        {path: '/', actions: ['read', 'write']},
        {path: 'CONFIG', actions: ['read']},
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
        [...getUserActions(pathlookup, user, '/').actions]);
      assert.deepStrictEqual(['read'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub').actions]);
      assert.deepStrictEqual(['read'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/q.html').actions]);
      assert.deepStrictEqual(['read', 'write'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub/sub').actions]);
      assert.deepStrictEqual(['read'],
        [...getUserActions(pathlookup, user, 'CONFIG').actions]);
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
      [...getUserActions(pathlookup, user, '/').actions]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/foo').actions]);
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate').actions]);
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/somewhere').actions]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/somewhere/else').actions]);
    assert.deepStrictEqual([],
      [...getUserActions(pathlookup, user, '/foobar').actions]);
    assert.deepStrictEqual([],
      [...getUserActions(pathlookup, user, '/foobar/har').actions]);
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/myfile.html').actions]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/blah').actions]);
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
