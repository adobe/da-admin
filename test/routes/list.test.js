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
import esmock from 'esmock';

describe('List Route', () => {
  it('Test getList with permissions', async () => {
    const loCalled = [];
    const listObjects = (e, c, maxKeys, restrictToPermitted) => {
      loCalled.push({
        e, c, maxKeys, restrictToPermitted,
      });
      return {};
    };

    const ctx = { org: 'foo', key: 'q/q/q' };
    const hasPermission = (c, k, a) => {
      if (k === 'q/q/q' && a === 'read') {
        return false;
      }
      return true;
    };
    // No descendant access either - the 403 must still hold.
    const hasDescendantPermission = () => false;

    const getList = await esmock('../../src/routes/list.js', {
      '../../src/storage/object/list.js': {
        default: listObjects,
      },
      '../../src/utils/auth.js': {
        hasPermission,
        hasDescendantPermission,
      },
    });
    const resp = await getList({ env: {}, daCtx: ctx, aclCtx: {} });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, loCalled.length);

    const aclCtx = { pathLookup: new Map() };
    await getList({
      env: {},
      daCtx: {
        org: 'bar', key: 'q/q', users: [], aclCtx,
      },
    });
    assert.strictEqual(1, loCalled.length);
    assert.strictEqual('q/q', loCalled[0].c.key);
    assert.strictEqual(false, loCalled[0].restrictToPermitted, 'a normally-permitted dir must not be filtered');

    const { childRules } = aclCtx;
    assert.strictEqual(1, childRules.length);
    assert(childRules[0].startsWith('/q/q/**='), 'Should have defined some child rule');
  });

  it('lists an ancestor folder when the user only has permission on a descendant', async () => {
    const loCalled = [];
    const listObjects = (e, c, maxKeys, restrictToPermitted) => {
      loCalled.push({ c, restrictToPermitted });
      return {};
    };

    // No direct permission on "" (root), but the user has read somewhere below it.
    const hasPermission = (c, k, a) => !(k === '' && a === 'read');
    const hasDescendantPermission = (c, k, a) => k === '' && a === 'read';

    const aclCtx = { pathLookup: new Map([['x', []]]) };
    const getList = await esmock('../../src/routes/list.js', {
      '../../src/storage/object/list.js': {
        default: listObjects,
      },
      '../../src/utils/auth.js': {
        hasPermission,
        hasDescendantPermission,
      },
    });

    const resp = await getList({
      env: {},
      daCtx: {
        org: 'bar', key: '', users: [], aclCtx,
      },
    });

    assert.notStrictEqual(resp?.status, 403);
    assert.strictEqual(1, loCalled.length, 'listObjects should still be invoked');
    assert.strictEqual(true, loCalled[0].restrictToPermitted, 'children must be filtered per-permission');
  });

  it('still returns 403 when the user has neither direct nor descendant permission', async () => {
    const loCalled = [];
    const listObjects = (...args) => {
      loCalled.push(args);
      return {};
    };
    const hasPermission = () => false;
    const hasDescendantPermission = () => false;

    const getList = await esmock('../../src/routes/list.js', {
      '../../src/storage/object/list.js': {
        default: listObjects,
      },
      '../../src/utils/auth.js': {
        hasPermission,
        hasDescendantPermission,
      },
    });

    const resp = await getList({
      env: {},
      daCtx: {
        org: 'bar', key: '', users: [], aclCtx: { pathLookup: new Map([['x', []]]) },
      },
    });

    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, loCalled.length);
  });
});
