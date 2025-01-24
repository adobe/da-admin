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
import {
  getAclCtx,
  getChildRules,
  getUserActions,
  hasPermission,
  logout,
  pathSorter } from '../../src/utils/auth.js';

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
              "path": "/x",
              "groups": "2345B0EA551D747/4711,123,joe@bloggs.org",
              "actions": "write",
            },
            {
              "path": "/**",
              "groups": "2345B0EA551D747/4711,123,joe@bloggs.org",
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
              "path": "/bar/ + **",
              "groups": "2345B0EA551D747/4711",
              "actions": "write",
            },
            {
              "path": "/bar/",
              "groups": "2345B0EA551D747/4711",
              "actions": "read",
            },
            {
              "path": "/bar/q",
              "groups": "2345B0EA551D747/4711",
              "actions": "read",
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

    it('test path sorting', async () => {
      const users = [{groups: [{orgIdent: '2345B0EA551D747', groupName: 4711}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/mykey');
      const paths = aclCtx.pathLookup.get('2345B0EA551D747/4711').map((x) => x.path);

      assert.strictEqual(8, paths.length);
      assert.strictEqual('/bar/q', paths[0], 'q should be counted as shorter than +**');
      assert.strictEqual('/bar/+**', paths[1], 'bar/+** should be longer than bar/');
      assert(paths[3] === '/bar' || paths[4] === '/bar', 'Within the same length there is no order');
      assert.strictEqual('/x', paths[5]);
      assert(paths[6] === '/**' || paths[7] === '/**', '/** should be counted as longer than /x');
    });

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
      const users = [{groups: [{orgIdent: '2345B0EA551D747', groupName: 4711}]}];
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
      const users = [{groups: [{orgIdent: '2345B0EA551D747', groupName: 8080}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({users, org: 'test', key: '/test', aclCtx}, 'test', 'write'));
      assert(hasPermission({users, org: 'test', key: '/test', aclCtx}, 'test', 'read'));
    });

    it('test hasPermissions3', async () => {
      const key = '/test';
      const users = [{groups: [{orgIdent: '2345B0EA551D747', groupName: 4711}, {orgIdent: '2345B0EA551D747', groupName: 8080}]}];
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
      const users = [{groups: [{ orgIdent: '123' }]}];
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
      const users = [{email: 'joe@bloggs.org', groups: [{orgIdent: '2345B0EA551D747', groupName: 4711}]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/bar/blah.html');
      const trace = aclCtx.actionTrace;

      assert.strictEqual(2, trace.length);
      const emailTraceIdx = trace[0].group === 'joe@bloggs.org' ? 0 : 1
      const groupTraceIdx = 1 - emailTraceIdx;
      assert.deepStrictEqual({group: 'joe@bloggs.org', path: '/**', actions: ['read']}, trace[emailTraceIdx]);
      assert.deepStrictEqual(
        {
          group: '2345B0EA551D747/4711',
          path: '/bar/+**',
          actions: [ 'read', 'write' ]
        }, trace[groupTraceIdx]);
    });

    it('test CONFIG api', async () => {
      const users = [{ groups: [{ orgIdent: "123" }]}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/', 'config');

      assert(hasPermission({users, org: 'test', aclCtx, key: ''}, 'CONFIG', 'write', true));
      assert(hasPermission({users, org: 'test', aclCtx, key: '/somewhere'}, 'CONFIG', 'write', true));
    });

    it('test CONFIG always has read permission', async () => {
      const users = [{ident: "blah@foo.org"}];
      const aclCtx = await getAclCtx(env2, 'test', users, '/', 'config');
      assert(aclCtx.actionSet.has('read'));
    })
  });

  describe('persmissions single sheet', () => {
    const DA_CONFIG = {
      'test': {
        "data": [
          {
            "path": "/**",
            "groups": "2345B0EA551D747/4711,123,joe@bloggs.org",
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
            "path": "/bar/ + **",
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
      const users = [{groups: [{orgIdent: '2345B0EA551D747', groupName: 4711}]}];
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
        {path: '/da-aem-boilerplate/authtest/sub/sub/**', actions: []},
        {path: '/da-aem-boilerplate/authtest/sub/**', actions: ['read', 'write']},
        {path: '/da-aem-boilerplate/authtest/**', actions: ['read']},
        {path: '/**', actions: ['read', 'write']},
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
      {path: '/da-aem-boilerplate/**', actions: ['read']},
      {path: '/da-aem-boilerplate', actions: ['read']},
      {path: '/somewhere', actions: ['read']},
      {path: '/foobar/+**', actions: []},
      {path: '/**', actions: ['read', 'write']},
      {path: '/', actions: ['read', 'write']},
    ];
    const pathlookup = new Map();
    pathlookup.set('joe@acme.com', patharr);
    const patharr2 = [
      {path: '/da-aem-boilerplate/authtest/myfile', actions: ['read']},
      {path: '/da-aem-boilerplate/authtest/myother.html', actions: ['read']},
      {path: '/da-aem-boilerplate/authtest/**', actions: ['read', 'write']},
      {path: '/**', actions: []},
    ];
    pathlookup.set('ABCDEFG/grp1', patharr2);

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
    assert.deepStrictEqual(['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/myother.html').actions]);
    assert.deepStrictEqual(['read', 'write'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/blah').actions]);
  });

  it('test logout', async () => {
    const deleteCalled = [];
    const deleteFunc = async (id) => {
      deleteCalled.push(id);
    }
    const DA_AUTH = { delete: deleteFunc};
    const env = { DA_AUTH };
    const daCtx = { users: [{ ident: '1234@a'}, { ident: '5678@b'}] };

    const resp = await logout({ env, daCtx });
    assert.deepStrictEqual(new Set(['1234@a', '5678@b']), new Set(deleteCalled));
    assert.strictEqual(200, resp.status);
  });

  it('test identifications', async () => {
    const user = {
      email: 'foo@bar.org',
      ident: '1234@abcd',
      groups: [
        { orgName: 'org1', orgIdent: 'ABCDEFG', ident: 111, groupName: 'grp1' },
        { orgName: 'org2', orgIdent: 'HIJKLMN', ident: 222, groupName: 'grp2' },
      ]};

    const pathLookup = new Map();
    pathLookup.set('ABCDEFG', [{ident: 'ABCDEFG', path: '/xyz', actions: ['read']}]);
    pathLookup.set('ABCDEFG/grp1', [{ident: 'ABCDEFG/grp1', path: '/xyz', actions: ['read']}]);
    pathLookup.set('ABCDEFG/111', [{ident: 'ABCDEFG/111', path: '/xyz', actions: ['read']}]);
    pathLookup.set('ABCDEFG/foo@bar.org', [{ident: 'ABCDEFG/foo@bar.org', path: '/xyz', actions: ['read']}]);
    pathLookup.set('org1/grp1', [{ident: 'org1/grp1', path: '/xyz', actions: ['read']}]);
    pathLookup.set('org1/111', [{ident: 'org1/111', path: '/xyz', actions: ['read']}]);
    pathLookup.set('HIJKLMN', [{ident: 'HIJKLMN', path: '/xyz', actions: ['read']}]);
    pathLookup.set('HIJKLMN/grp2', [{ident: 'HIJKLMN/grp2', path: '/xyz', actions: ['read']}]);
    pathLookup.set('HIJKLMN/222', [{ident: 'HIJKLMN/222', path: '/xyz', actions: ['read']}]);
    pathLookup.set('HIJKLMN/foo@bar.org', [{ident: 'HIJKLMN/foo@bar.org', path: '/xyz', actions: ['read']}]);
    pathLookup.set('org2/grp2', [{ident: 'org2/grp2', path: '/xyz', actions: ['read']}]);
    pathLookup.set('org2/222', [{ident: 'org2/222', path: '/xyz', actions: ['read']}]);
    pathLookup.set('foo@bar.org', [{ident: 'foo@bar.org', path: '/xyz', actions: ['read']}]);
    pathLookup.set('1234@abcd', [{ident: '1234@abcd', path: '/xyz', actions: ['read']}]);
    const res = getUserActions(pathLookup, user, '/xyz');

    const matchedIds = res.trace.map((r) => r.ident);
    assert.strictEqual(7, matchedIds.length);
    assert(matchedIds.includes('ABCDEFG'));
    assert(matchedIds.includes('ABCDEFG/grp1'));
    assert(matchedIds.includes('ABCDEFG/foo@bar.org'));
    assert(matchedIds.includes('HIJKLMN'));
    assert(matchedIds.includes('HIJKLMN/grp2'));
    assert(matchedIds.includes('HIJKLMN/foo@bar.org'));
    assert(matchedIds.includes('foo@bar.org'));
  });

  function hasRule(rules, path, action) {
    return rules.some((r) => r.path === path && r.actions.includes(action));
  }

  it('test get child rules', async () => {
    const pathLookup = new Map();
    pathLookup.set('a@foo.org', [
      {path: '/**', actions: ['read']},
      {path: '/something', actions: ['write']},
      {path: '/foo/bar', actions: ['write']},
      {path: '/blah/+**', actions: ['write']},
      {path: '/blah/haha', actions: ['read']},
      {path: '/blah/hoho/**', actions: ['read']},
      {path: '/blah/hoho/hihi', actions: ['read']},
    ]);
    pathLookup.set('ABCDEF', [
      {path: '/blah/hohoho', actions: ['read']},
      {path: '/blah/+**', actions: ['read']},
    ]);
    pathLookup.forEach((value) => value.sort(pathSorter));

    const aclCtx = { pathLookup };
    const daCtx = { users: [{email: 'a@foo.org', groups: [{orgIdent: 'ABCDEF'}]}], aclCtx, key: '/blah' };
    getChildRules(daCtx);
    const rules = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules.length);
    assert(rules[0] === '/blah/**=read,write' || rules[0] === '/blah/**=write,read');

    delete daCtx.aclCtx.childRules;
    getChildRules({...daCtx, key: '/foo/'});
    const rules2 = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules2.length);
    assert.strictEqual('/foo/**=read', rules2[0]);

    delete daCtx.aclCtx.childRules;
    getChildRules({...daCtx, key: '/something'});
    const rules3 = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules3.length);
    assert.strictEqual('/something/**=read', rules3[0]);

    delete daCtx.aclCtx.childRules;
    getChildRules({...daCtx, key: '/blah/yee/haa'});
    const rules4 = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules4.length);
    assert(rules4[0] === '/blah/yee/haa/**=read,write' || rules4[0] === '/blah/yee/haa/**=write,read');

    delete daCtx.aclCtx.childRules;
    const daCtx2 = { users: [{email: 'a@foo.org', groups: []}], aclCtx, key: '/blah' };
    getChildRules(daCtx2);
    const rules5 = daCtx2.aclCtx.childRules;
    assert.strictEqual(1, rules5.length);
    assert.strictEqual('/blah/**=write', rules5[0]);

    delete daCtx.aclCtx.childRules;
    const users = [{email: 'a@foo.org', groups: []}, {email: 'blah@foo.org', groups: [{orgIdent: 'ABCDEF'}]}];
    const daCtx3 = { users, aclCtx, key: '/blah' };
    getChildRules(daCtx3);
    const rules6 = daCtx3.aclCtx.childRules;
    assert.strictEqual(1, rules6.length);
    assert(rules6[0] === '/blah/**=read,write' || rules6[0] === '/blah/**=write,read');
  });
});
