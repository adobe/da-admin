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
import { describe, it, afterEach, vi, expect, beforeAll } from 'vitest';
import getList from '../../src/routes/list.js';
import listObjects from '../../src/storage/object/list.js';
import listBuckets from '../../src/storage/bucket/list.js';
import { hasPermission } from '../../src/utils/auth.js';

describe('List Route', () => {
  beforeAll(() => {
    vi.mock('../../src/storage/object/list.js', () => ({
      default: vi.fn(() => ({ status: 200 }))
    }));
    vi.mock('../../src/storage/bucket/list.js', () => ({
      default: vi.fn(() => ({ status: 200 }))
    }));
    vi.mock('../../src/utils/auth.js', async () => {
      const actual = await vi.importActual('../../src/utils/auth.js');
      return {
        ...actual,
        hasPermission: vi.fn(),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test getList with permissions', async () => {
    const ctx = { org: 'foo', key: 'q/q/q' };
    const env = {};

    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'q/q/q' && a === 'read') {
        return false;
      }
      return true;
    });

    const resp = await getList({ env, daCtx: ctx, aclCtx: {} });
    expect(resp.status).to.eq(403);
    expect(listObjects).not.toHaveBeenCalled();

    const aclCtx = { pathLookup: new Map() };
    const ctx2 = { org: 'bar', key: 'q/q', users: [], aclCtx };
    
    const resp2 = await getList({ env, daCtx: ctx2 });
    expect(resp2.status).to.eq(200);
    expect(listObjects).toHaveBeenCalledWith(env, ctx2);

    const childRules = aclCtx.childRules;
    expect(childRules.length).to.eq(1);
    expect(childRules[0]).to.match(/^\/q\/q\/\*\*=/);
  });

  it('Test getList without org returns buckets', async () => {
    const ctx = {};
    const env = {};

    const resp = await getList({ env, daCtx: ctx });
    expect(resp.status).to.eq(200);
    expect(listBuckets).toHaveBeenCalledWith(env, ctx);
    expect(listObjects).not.toHaveBeenCalled();
  });
});
