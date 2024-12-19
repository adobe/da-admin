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

describe('Config', () => {
  it('Test postConfig has permission', async () => {
    const ctx = {};
    const env = {};
    const req = {};

    const putKVCalled = []
    const putKV = async (r, q, c) => {
      putKVCalled.push({r, q, c});
      return 'called';
    };

    const hasPermission = (c, k, a, kw) => {
      if (c === ctx && k === 'CONFIG' && a === 'write' && kw === true) {
        return true;
      }
    };

    const { postConfig } = await esmock(
      '../../src/routes/config.js', {
        '../../src/storage/kv/put.js': {
          default: putKV,
        },
        '../../src/utils/auth.js': {
          hasPermission,
        }
      }
    );

    const res = await postConfig({ req, env, daCtx: ctx });
    assert.strictEqual(res, 'called');
    assert.deepStrictEqual(putKVCalled, [{r: req, q: env, c: ctx}]);
  });

  it('Test admin permission', async () => {
    const ctx = {
      org: 'myorg', users: [{email: 'user1@foo.org'}, {email: 'user2@foo.org'}]
    };
    const env = {};
    const req = {};

    const putKVCalled = []
    const putKV = async (r, e, c) => {
      putKVCalled.push({r, e, c});
      return 'putKV() called';
    };
    const getKVCalled = []
    const getKV = async (e, c) => {
      getKVCalled.push({e, c});
      return 'getKV() called';
    };

    const hasPermission = () => false;
    const isAdmin = (e, o, u) => {
      if (e === env && o === ctx.org && u === ctx.users) {
        return true;
      }
    };

    const { getConfig, postConfig } = await esmock(
      '../../src/routes/config.js', {
        '../../src/storage/kv/get.js': {
          default: getKV,
        },
        '../../src/storage/kv/put.js': {
          default: putKV,
        },
        '../../src/utils/auth.js': {
          hasPermission,
          isAdmin,
        }
      }
    );

    const res = await getConfig({ env, daCtx: ctx });
    assert.strictEqual(res, 'getKV() called');
    assert.deepStrictEqual(getKVCalled, [{e: env, c: ctx}]);

    const res2 = await postConfig({ req, env, daCtx: ctx });
    assert.strictEqual(res2, 'putKV() called');
    assert.deepStrictEqual(putKVCalled, [{r: req, e: env, c: ctx}]);
  });

  it('Test getConfig has permission', async () => {
    const ctx = {};
    const env = {};
    const req = {};

    const getKVCalled = []
    const getKV = async (e, c) => {
      getKVCalled.push({e, c});
      return 'called';
    };

    const hasPermission = (c, k, a, kw) => {
      if (c === ctx && k === 'CONFIG' && a === 'read' && kw === true) {
        return true;
      }
    };

    const { getConfig } = await esmock(
      '../../src/routes/config.js', {
        '../../src/storage/kv/get.js': {
          default: getKV,
        },
        '../../src/utils/auth.js': {
          hasPermission,
        }
      }
    );

    const res = await getConfig({ env, daCtx: ctx });
    assert.strictEqual(res, 'called');
    assert.deepStrictEqual(getKVCalled, [{e: env, c: ctx}]);
  });

  it('Test no permission', async () => {
    const ctx = {};
    const env = {};
    const req = {};

    const putKVCalled = []
    const putKV = async (r, e, c) => {
      putKVCalled.push({r, e, c});
    };
    const getKVCalled = []
    const getKV = async (e, c) => {
      getKVCalled.push({e, c});
    };

    const hasPermission = () => false;
    const isAdmin = () => false;

    const { getConfig, postConfig } = await esmock(
      '../../src/routes/config.js', {
        '../../src/storage/kv/get.js': {
          default: getKV,
        },
        '../../src/storage/kv/put.js': {
          default: putKV,
        },
        '../../src/utils/auth.js': {
          hasPermission,
          isAdmin,
        }
      }
    );

    const res = await getConfig({ env, daCtx: ctx });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(getKVCalled.length, 0);

    const res2 = await postConfig({ req, env, daCtx: ctx });
    assert.strictEqual(res2.status, 403);
    assert.strictEqual(putKVCalled.length, 0);
  });
});
