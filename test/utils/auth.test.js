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
/* eslint-disable no-shadow */
import assert from 'node:assert';
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
  pathSorter,
} from '../../src/utils/auth.js';

// ES Mocks
const {
  setUser,
  getUsers,
} = await esmock('../../src/utils/auth.js', { jose });

async function withMockedFetch(act) {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    await act();
  } finally {
    globalThis.fetch = savedFetch;
  }
}

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
      await withMockedFetch(async () => {
        const users = await getUsers(reqs.site, env);
        assert.strictEqual(users[0].email, 'aparker@geometrixx.info');
      });
    });

    it('authorized with user if email matches and anonymous if present', async () => {
      await withMockedFetch(async () => {
        const users = await getUsers(reqs.siteMulti, env);
        assert.strictEqual(users[0].email, 'anonymous');
        assert.strictEqual(users[1].email, 'aparker@geometrixx.info');
      });
    });

    it('anonymous if ims fails', async () => {
      const users = await getUsers(reqs.media, env);
      assert.strictEqual(users[0].email, 'anonymous');
    });
  });

  describe('set user', async () => {
    it('sets user', async () => {
      const headers = new Headers({
        Authorization: 'Bearer aparker@geometrixx.info',
      });

      let userValue;

      await withMockedFetch(async () => {
        const userValStr = await setUser('aparker@geometrixx.info', 100, headers, env);
        userValue = JSON.parse(userValStr);
      });

      assert.strictEqual('aparker@geometrixx.info', userValue.email);
      assert.strictEqual('123', userValue.ident);

      const expectedOrgs = [
        {
          orgName: 'Org1',
          orgIdent: '2345B0EA551D747',
          groups: [
            { groupName: 'READ_WRITE_STANDARD@DEV' },
            { groupName: 'READ_ONLY_STANDARD@PROD' },
          ],
        },
        { orgName: 'Org No groups', orgIdent: '139024093', groups: [] },
        {
          orgName: 'ACME Inc.',
          orgIdent: 'EE23423423423',
          groups: [
            { groupName: 'Emp' },
            { groupName: 'org-test' },
          ],
        },
      ];
      assert.deepStrictEqual(expectedOrgs, userValue.orgs);
    });
  });

  describe('path authorization', async () => {
    const DA_CONFIG = {
      test: {
        total: 1,
        limit: 1,
        offset: 0,
        permissions: {
          data: [
            {
              path: '/x',
              groups: '2345B0EA551D747/4711,123,joe@bloggs.org,MEL@bloggs.org',
              actions: 'write',
            },
            {
              path: '/**',
              groups: '2345B0EA551D747/4711,123,joe@bloggs.org,MEL@bloggs.org',
              actions: 'read',
            },
            {
              path: '/**',
              groups: '2345B0EA551D747/8080',
              actions: 'write',
            },
            {
              path: '/foo',
              groups: '2345B0EA551D747/4711',
              actions: 'write',
            },
            {
              path: '/bar/ + **',
              groups: '2345B0EA551D747/4711',
              actions: 'write',
            },
            {
              path: '/bar/',
              groups: '2345B0EA551D747/4711',
              actions: 'read',
            },
            {
              path: '/bar/q',
              groups: '2345B0EA551D747/4711',
              actions: 'read',
            },
            {
              path: '/',
              groups: '2345B0EA551D747/4711',
              actions: 'write',
            },
            {
              path: '/furb/',
              groups: '2345B0EA551D747/4711',
              actions: 'write',
            },
            {
              path: '/tar/abc',
              groups: '2345B0ea551D747/4711',
              actions: 'write',
            },
            {
              path: 'ACLTRACE',
              groups: 'joe@bloggs.org,MEL@bloggs.org',
              actions: 'read',
            },
            {
              path: 'CONFIG',
              groups: '123',
              actions: 'write',
            },
          ],
        },
        ':type': 'multi-sheet',
      },
    };

    const env2 = {
      DA_CONFIG: {
        get: (name) => DA_CONFIG[name],
      },
    };

    it('test path sorting', async () => {
      const users = [{ groups: [{ orgIdent: '2345B0EA551D747', groupName: 4711 }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/mykey');
      const paths = aclCtx.pathLookup.get('2345b0ea551d747/4711').map((x) => x.path);

      assert.strictEqual(9, paths.length);
      assert.strictEqual('/bar/q', paths[1], 'q should be counted as longer than +**');
      assert.strictEqual('/bar/+**', paths[2], 'bar/+** should be longer than bar/');
      assert(paths[4] === '/bar' || paths[5] === '/bar', 'Within the same length there is no order');
      assert.strictEqual('/x', paths[6]);
      assert(paths[7] === '/**' || paths[8] === '/**', '/** should be counted as shorter than /x');
    });

    it('test hasPermission returns false when path is null or undefined', async () => {
      const users = [{ orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '4711' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      // Test with null path - should return false
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, null, 'read'));

      // Test with undefined path - should return false
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, undefined, 'read'));

      // Test with empty string path - should NOT return false (valid root path)
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '', 'read'));
    });

    it('test anonymous permissions', async () => {
      const users = [{ email: 'anonymous' }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'write'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'write'));
    });

    it('test hasPermissions', async () => {
      const key = '';
      const users = [{ orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '4711' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/foo', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/bar', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/bar/something.jpg', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/flob', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/furb', 'write'));
    });

    it('test hasPermissions2', async () => {
      const users = [{ orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '8080' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({
        users, org: 'test', key: '/test', aclCtx,
      }, 'test', 'write'));
      assert(hasPermission({
        users, org: 'test', key: '/test', aclCtx,
      }, 'test', 'read'));
    });

    it('test hasPermissions2a', async () => {
      const users = [{ orgs: [{ orgIdent: '2345B0ea551D747', groups: [{ groupName: '8080' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({
        users, org: 'test', key: '/test', aclCtx,
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', key: '/test', aclCtx,
      }, '/test', 'read'));
    });

    it('test hasPermissions2b', async () => {
      const users = [{ orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '8080' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({
        users, org: 'test', key: '/test', aclCtx,
      }, '/tar/abc', 'write'));
      assert(hasPermission({
        users, org: 'test', key: '/test', aclCtx,
      }, '/tar/abc', 'read'));
    });

    it('test hasPermissions3', async () => {
      const key = '/test';
      const users = [{ orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '4711' }, { groupName: '8080' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'write'));
    });

    it('test hasPermissions4', async () => {
      const key = '';
      const users = [{ orgs: [] }];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(!hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
    });

    it('test hasPermissions5', async () => {
      const key = '';
      const users = [{ orgs: [{ orgIdent: '123' }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, key);

      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'write'));
    });

    it('test hasPermissions6', async () => {
      const users = [{ email: 'joe@bloggs.org', orgs: [] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'write'));
    });

    it('test hasPermissions7', async () => {
      const users = [{ email: 'JOE@BLOGGS.ORG', orgs: [] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/x', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/x', 'write'));
    });

    it('test hasPermissions8', async () => {
      const users = [{ email: 'mel@bloggs.org', orgs: [] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/test');

      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/x', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/x', 'write'));
    });

    it('test trace information', async () => {
      const users = [{ email: 'joe@bloggs.org', orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '4711' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/bar/blah.html');
      const trace = aclCtx.actionTrace;

      assert.strictEqual(2, trace.length);
      const emailTraceIdx = trace[0].group === 'joe@bloggs.org' ? 0 : 1;
      const groupTraceIdx = 1 - emailTraceIdx;
      assert.deepStrictEqual({ group: 'joe@bloggs.org', path: '/**', actions: ['read'] }, trace[emailTraceIdx]);
      assert.deepStrictEqual({
        group: '2345b0ea551d747/4711',
        path: '/bar/+**',
        actions: ['read', 'write'],
      }, trace[groupTraceIdx]);
    });

    it('test trace information2', async () => {
      const users = [{ email: 'MEL@BLOGGS.ORG', orgs: [{ orgIdent: 'abcd', groups: [{ groupName: '1234' }] }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/bar/blah.html');
      const trace = aclCtx.actionTrace;

      assert.deepStrictEqual([{ group: 'mel@bloggs.org', path: '/**', actions: ['read'] }], trace);
    });

    it('test CONFIG api', async () => {
      const users = [{ orgs: [{ orgIdent: '123' }] }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/', 'config');

      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, 'CONFIG', 'write', true));
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '/somewhere',
      }, 'CONFIG', 'write', true));
    });

    it('test CONFIG always has read permission', async () => {
      const users = [{ email: 'blah@foo.org' }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/', 'config');
      assert(aclCtx.actionSet.has('read'));
    });

    it('test versionsource api always has read permission', async () => {
      const users = [{ email: 'blah@foo.org' }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/', 'versionsource');
      assert(aclCtx.actionSet.has('read'));
    });

    it('test versionsource api grants read permission even without explicit permissions', async () => {
      const users = [{ email: 'unauthorized@example.com' }];
      const aclCtx = await getAclCtx(env2, 'test', users, '/restricted', 'versionsource');
      assert(aclCtx.actionSet.has('read'));
      assert(!aclCtx.actionSet.has('write'));
    });

    it('test DA_OPS_IMS_ORG permissions', async () => {
      const opsOrg = 'MyOpsOrg';
      const envOps = {
        ...env2,
        DA_OPS_IMS_ORG: opsOrg,
      };

      // User in the OPS ORG
      const users = [{ orgs: [{ orgIdent: opsOrg }] }];
      const aclCtx = await getAclCtx(envOps, 'test', users, '/', 'config');

      // Should have write permission on CONFIG because of DA_OPS_IMS_ORG injection
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, 'CONFIG', 'write', true));

      // Should have write permission on / because of DA_OPS_IMS_ORG injection (path: '/ + **')
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/', 'write'));

      // Should have write permission on path because of DA_OPS_IMS_ORG injection (path: '/ + **')
      assert(hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/some/deep/path', 'write'));
    });
  });

  describe('persmissions single sheet', () => {
    const DA_CONFIG = {
      test: {
        data: [
          {
            path: '/**',
            groups: '2345B0EA551D747/4711,123,joe@bloggs.org',
            actions: 'read',
          },
          {
            path: '/**',
            groups: '2345B0EA551D747/8080',
            actions: 'write',
          },
          {
            path: '/foo',
            groups: '2345B0EA551D747/4711',
            actions: 'write',
          },
          {
            path: '/bar/ + **',
            groups: '2345B0EA551D747/4711',
            actions: 'write',
          },
          {
            path: '/',
            groups: '2345B0EA551D747/4711',
            actions: 'write',
          },
          {
            path: '/furb/',
            groups: '2345B0EA551D747/4711',
            actions: 'write',
          },
          {
            path: 'CONFIG',
            groups: 'read-first@bloggs.org',
            actions: 'read',
          },
          {
            path: 'CONFIG',
            groups: 'read-first@bloggs.org',
            actions: 'write',
          },
          {
            path: '/test',
            groups: 'read-first@bloggs.org',
            actions: 'read',
          },
          {
            path: '/test',
            groups: 'read-first@bloggs.org',
            actions: 'write',
          },
          {
            path: 'CONFIG',
            groups: 'write-first@bloggs.org',
            actions: 'write',
          },
          {
            path: 'CONFIG',
            groups: 'write-first@bloggs.org',
            actions: 'read',
          },
          {
            path: '/test',
            groups: 'write-first@bloggs.org',
            actions: 'write',
          },
          {
            path: '/test',
            groups: 'write-first@bloggs.org',
            actions: 'read',
          },
        ],
        ':type': 'sheet',
        ':sheetname': 'permissions',
      },
    };

    const env = {
      DA_CONFIG: {
        get: (name) => DA_CONFIG[name],
      },
    };

    it('test anonymous permissions', async () => {
      const users = [{ email: 'anonymous' }];
      const aclCtx = await getAclCtx(env, 'test', users, '/test');

      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '',
      }, '/test', 'write'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key: '/test',
      }, '/test', 'write'));
    });

    it('test hasPermissions', async () => {
      const key = '';
      const users = [{ orgs: [{ orgIdent: '2345B0EA551D747', groups: [{ groupName: '4711' }] }] }];
      const aclCtx = await getAclCtx(env, 'test', users, key);

      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
      assert(!hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/foo', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/bar', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/bar/something.jpg', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/flob', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/furb', 'write'));
    });

    it('test hasPermissions if read and write user', async () => {
      const key = '';
      const users = [{ email: 'read-first@bloggs.org' }];
      const aclCtx = await getAclCtx(env, 'test', users, key);

      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, 'CONFIG', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, 'CONFIG', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'write'));
    });

    it('test hasPermissions if write and read user', async () => {
      const key = '';
      const users = [{ email: 'write-first@bloggs.org' }];
      const aclCtx = await getAclCtx(env, 'test', users, key);

      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, 'CONFIG', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, 'CONFIG', 'write'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'read'));
      assert(hasPermission({
        users, org: 'test', aclCtx, key,
      }, '/test', 'write'));
    });
  });

  it('test getAclCtx missing props', async () => {
    const aclCtx = await getAclCtx({}, 'myorg', [], '/foo');
    assert.strictEqual(aclCtx.pathLookup.size, 0);
    assert(aclCtx.actionSet.has('read'));
    assert(aclCtx.actionSet.has('write'));
  });

  it('test getAclCtx missing props2', async () => {
    // eslint-disable-next-line consistent-return
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
    // eslint-disable-next-line consistent-return
    const cfgGet = (o, t) => {
      if ((o === 'someorg') && (t.type === 'json')) {
        return { permissions: {} };
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
    // eslint-disable-next-line consistent-return
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
    // eslint-disable-next-line consistent-return
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
    // eslint-disable-next-line consistent-return
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
        { path: '/da-aem-boilerplate/authtest/sub/sub/**', actions: [] },
        { path: '/da-aem-boilerplate/authtest/sub/**', actions: ['read', 'write'] },
        { path: '/da-aem-boilerplate/authtest/**', actions: ['read'] },
        { path: '/**', actions: ['read', 'write'] },
        { path: '/', actions: ['read', 'write'] },
        { path: 'CONFIG', actions: ['read'] },
      ];

      const pathlookup = new Map();
      pathlookup.set('joe@acme.com', patharr);

      const user = {
        email: 'joe@acme.com',
        ident: 'AAAA@bbb.e',
      };

      assert.deepStrictEqual(
        ['read', 'write'],
        [...getUserActions(pathlookup, user, '/').actions],
      );
      assert.deepStrictEqual(
        ['read'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub').actions],
      );
      assert.deepStrictEqual(
        ['read'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/q.html').actions],
      );
      assert.deepStrictEqual(
        ['read', 'write'],
        [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub/sub').actions],
      );
      assert.deepStrictEqual(
        ['read'],
        [...getUserActions(pathlookup, user, 'CONFIG').actions],
      );
    });
  });

  it('get user actions2', () => {
    const patharr = [
      { path: '/da-aem-boilerplate/**', actions: ['read'] },
      { path: '/da-aem-boilerplate', actions: ['read'] },
      { path: '/somewhere', actions: ['read'] },
      { path: '/foobar/+**', actions: [] },
      { path: '/**', actions: ['read', 'write'] },
      { path: '/', actions: ['read', 'write'] },
    ];
    const pathlookup = new Map();
    pathlookup.set('joe@acme.com', patharr);
    const patharr2 = [
      { path: '/da-aem-boilerplate/authtest/myfile', actions: ['read'] },
      { path: '/da-aem-boilerplate/authtest/myother.html', actions: ['read'] },
      { path: '/da-aem-boilerplate/authtest/**', actions: ['read', 'write'] },
      { path: '/**', actions: [] },
    ];
    pathlookup.set('abcdefg/grp1', patharr2);

    const user = {
      email: 'joe@acme.com',
      ident: 'AAAA@bbb.e',
      orgs: [{
        orgName: 'org1',
        orgIdent: 'ABCDEFG',
        groups: [{ groupName: 'grp1' }],
      }, {
        orgName: 'org2',
        orgIdent: 'ZZZZZZZ',
        groups: [{ groupName: 'grp2' }],
      }],
    };
    assert.deepStrictEqual(
      ['read', 'write'],
      [...getUserActions(pathlookup, user, '/').actions],
    );
    assert.deepStrictEqual(
      ['read', 'write'],
      [...getUserActions(pathlookup, user, '/foo').actions],
    );
    assert.deepStrictEqual(
      ['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate').actions],
    );
    assert.deepStrictEqual(
      ['read'],
      [...getUserActions(pathlookup, user, '/somewhere').actions],
    );
    assert.deepStrictEqual(
      ['read', 'write'],
      [...getUserActions(pathlookup, user, '/somewhere/else').actions],
    );
    assert.deepStrictEqual(
      [],
      [...getUserActions(pathlookup, user, '/foobar').actions],
    );
    assert.deepStrictEqual(
      [],
      [...getUserActions(pathlookup, user, '/foobar/har').actions],
    );
    assert.deepStrictEqual(
      ['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/myfile.html').actions],
    );
    assert.deepStrictEqual(
      ['read'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/myother.html').actions],
    );
    assert.deepStrictEqual(
      ['read', 'write'],
      [...getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/blah').actions],
    );
  });

  it('test logout', async () => {
    const deleteCalled = [];
    const deleteFunc = async (id) => {
      deleteCalled.push(id);
    };
    const DA_AUTH = { delete: deleteFunc };
    const env = { DA_AUTH };
    const daCtx = { users: [{ ident: '1234@a' }, { ident: '5678@b' }] };

    const resp = await logout({ env, daCtx });
    assert.deepStrictEqual(new Set(['1234@a', '5678@b']), new Set(deleteCalled));
    assert.strictEqual(200, resp.status);
  });

  it('test identifications', async () => {
    const user = {
      email: 'foo@bar.org',
      ident: '1234@abcd',
      orgs: [{
        orgName: 'org1',
        orgIdent: 'ABCDEFG',
        groups: [{ groupName: 'grp1' }],
      }, {
        orgName: 'org2',
        orgIdent: 'HIJKLMN',
        groups: [{ groupName: 'grp2' }],
      }],
    };
    const pathLookup = new Map();
    pathLookup.set('abcdefg', [{ ident: 'abcdefg', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('abcdefg/grp1', [{ ident: 'abcdefg/grp1', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('abcdefg/111', [{ ident: 'abcdefg/111', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('abcdefg/foo@bar.org', [{ ident: 'abcdefg/foo@bar.org', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('org1/grp1', [{ ident: 'org1/grp1', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('org1/111', [{ ident: 'org1/111', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('hijklmn', [{ ident: 'hijklmn', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('hijklmn/grp2', [{ ident: 'hijklmn/grp2', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('hijklmn/222', [{ ident: 'hijklmn/222', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('hijklmn/foo@bar.org', [{ ident: 'hijklmn/foo@bar.org', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('org2/grp2', [{ ident: 'org2/grp2', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('org2/222', [{ ident: 'org2/222', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('foo@bar.org', [{ ident: 'foo@bar.org', path: '/xyz', actions: ['read'] }]);
    pathLookup.set('1234@abcd', [{ ident: '1234@abcd', path: '/xyz', actions: ['read'] }]);
    const res = getUserActions(pathLookup, user, '/xyz');

    const matchedIds = res.trace.map((r) => r.ident);
    assert.strictEqual(7, matchedIds.length);
    assert(matchedIds.includes('abcdefg'));
    assert(matchedIds.includes('abcdefg/grp1'));
    assert(matchedIds.includes('abcdefg/foo@bar.org'));
    assert(matchedIds.includes('hijklmn'));
    assert(matchedIds.includes('hijklmn/grp2'));
    assert(matchedIds.includes('hijklmn/foo@bar.org'));
    assert(matchedIds.includes('foo@bar.org'));
  });

  it('test get child rules', async () => {
    const pathLookup = new Map();
    pathLookup.set('a@foo.org', [
      { path: '/**', actions: ['read'] },
      { path: '/something', actions: ['write'] },
      { path: '/foo/bar', actions: ['write'] },
      { path: '/blah/+**', actions: ['write'] },
      { path: '/blah/haha', actions: ['read'] },
      { path: '/blah/hoho/**', actions: ['read'] },
      { path: '/blah/hoho/hihi', actions: ['read'] },
      { path: '/hello/+**', actions: ['read', 'write'] },
    ]);
    pathLookup.set('abcdef', [
      { path: '/blah/hohoho', actions: ['read'] },
      { path: '/blah/+**', actions: ['read'] },
      { path: '/hello/+**', actions: ['read'] },
    ]);
    pathLookup.forEach((value) => value.sort(pathSorter));

    const aclCtx = { pathLookup };
    const daCtx = { users: [{ email: 'a@foo.org', orgs: [{ orgIdent: 'ABCDEF' }] }], aclCtx, key: '/blah' };
    getChildRules(daCtx);
    const rules = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules.length);
    assert(rules[0] === '/blah/**=read,write' || rules[0] === '/blah/**=write,read');

    delete daCtx.aclCtx.childRules;
    getChildRules({ ...daCtx, key: '/foo/' });
    const rules2 = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules2.length);
    assert.strictEqual('/foo/**=read', rules2[0]);

    delete daCtx.aclCtx.childRules;
    getChildRules({ ...daCtx, key: '/something' });
    const rules3 = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules3.length);
    assert.strictEqual('/something/**=read', rules3[0]);

    delete daCtx.aclCtx.childRules;
    getChildRules({ ...daCtx, key: '/blah/yee/haa' });
    const rules4 = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules4.length);
    assert(rules4[0] === '/blah/yee/haa/**=read,write' || rules4[0] === '/blah/yee/haa/**=write,read');

    delete daCtx.aclCtx.childRules;
    const daCtx2 = { users: [{ email: 'a@foo.org', groups: [] }], aclCtx, key: '/blah' };
    getChildRules(daCtx2);
    const rules5 = daCtx2.aclCtx.childRules;
    assert.strictEqual(1, rules5.length);
    assert.strictEqual('/blah/**=write', rules5[0]);

    delete daCtx.aclCtx.childRules;
    const users = [{ email: 'a@foo.org', orgs: [] }, { email: 'blah@foo.org', orgs: [{ orgIdent: 'ABCDEF' }] }];
    const daCtx3 = { users, aclCtx, key: '/blah' };
    getChildRules(daCtx3);
    const rules6 = daCtx3.aclCtx.childRules;
    assert.strictEqual(1, rules6.length);
    assert.strictEqual('/blah/**=', rules6[0]);

    delete daCtx.aclCtx.childRules;
    const daCtx4 = { users, aclCtx, key: '/hello' };
    getChildRules(daCtx4);
    const rules7 = daCtx4.aclCtx.childRules;
    assert.strictEqual(1, rules7.length);
    assert.strictEqual('/hello/**=read', rules7[0]);
  });

  it('test get child rules when there are no acls', async () => {
    const pathLookup = new Map();
    const aclCtx = { pathLookup };
    const daCtx = { users: [{ email: 'anonymous' }], aclCtx, key: '/foo' };
    getChildRules(daCtx);
    const rules = daCtx.aclCtx.childRules;
    assert.strictEqual(1, rules.length);
    assert(rules[0] === '/foo/**=read,write' || rules[0] === '/foo/**=write,read');
  });
});
