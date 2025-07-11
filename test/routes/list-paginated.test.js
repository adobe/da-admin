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
import assert from 'assert';
import { describe, it, afterEach, vi, beforeAll } from 'vitest';
import getListPaginated from '../../src/routes/list-paginated.js';
import { listObjectsPaginated } from '../../src/storage/object/list.js';
import { hasPermission, getChildRules } from '../../src/utils/auth.js';

describe('List Route', () => {
  beforeAll(() => {
    vi.mock('../../src/storage/object/list.js', () => ({
      listObjectsPaginated: vi.fn()
    }));
    vi.mock('../../src/utils/auth.js', async () => {
      const actual = await vi.importActual('../../src/utils/auth.js');
      return {
        ...actual,
        hasPermission: vi.fn(),
        getChildRules: vi.fn()
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test getListPaginated with permissions', async () => {
    const loCalled = [];
    listObjectsPaginated.mockImplementation((e, c) => {
      loCalled.push({ e, c });
      return {};
    });

    const ctx = { org: 'foo', key: 'q/q/q' };
    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'q/q/q' && a === 'read') {
        return false;
      }
      return true;
    });

    const req = {
      url: new URL('https://admin.da.live/list/foo/bar'),
    };

    const resp = await getListPaginated({ req, env: {}, daCtx: ctx, aclCtx: {} });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, loCalled.length);

    const aclCtx = { pathLookup: new Map() };
    const daCtx = { org: 'bar', key: 'q/q', users: [], aclCtx };
    
    // Mock getChildRules to set childRules on the aclCtx
    getChildRules.mockImplementation((ctx) => {
      ctx.aclCtx.childRules = ['/q/q/**=read,write'];
    });

    await getListPaginated({ req, env: {}, daCtx });
    assert.strictEqual(1, loCalled.length);
    assert.strictEqual('q/q', loCalled[0].c.key);

    const childRules = aclCtx.childRules;
    assert.strictEqual(1, childRules.length);
    assert(childRules[0].startsWith('/q/q/**='), 'Should have defined some child rule');
  });

  it('parses request params', async () => {
    const loCalled = [];
    listObjectsPaginated.mockImplementation((e, c, limit, offset) => {
      console.log({offset, limit});
      loCalled.push({ offset, limit });
      return {};
    });

    hasPermission.mockImplementation(() => true);
    getChildRules.mockImplementation(() => {});

    const ctx = { org: 'foo' };
    const reqs = [
      { url: 'https://admin.da.live/list/foo/bar?limit=12&offset=1' },
      { url: 'https://admin.da.live/list/foo/bar?limit=asdf&offset=17' },
      { url: 'https://admin.da.live/list/foo/bar?limit=12&offset=asdf' },
    ];
    await getListPaginated({ req: reqs[0], env: {}, daCtx: ctx, aclCtx: {} });
    assert.deepStrictEqual(loCalled[0], { limit: 12, offset: 1 });
    await getListPaginated({ req: reqs[1], env: {}, daCtx: ctx, aclCtx: {} });
    assert.deepStrictEqual(loCalled[1], { limit: undefined, offset: 17 });
    await getListPaginated({ req: reqs[2], env: {}, daCtx: ctx, aclCtx: {} });
    assert.deepStrictEqual(loCalled[2], { limit: 12, offset: undefined });
  });
});
