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
import { describe, it, afterEach, vi, expect, beforeAll } from 'vitest';

import { getConfig, postConfig } from '../../src/routes/config.js';
import { hasPermission } from '../../src/utils/auth.js';
import putKv from "../../src/storage/kv/put.js";
import getKv from "../../src/storage/kv/get.js";

describe('Config', () => {
  beforeAll(() => {
    vi.mock('../../src/storage/kv/get.js', () => ({
      default: vi.fn(() => { return 'called' })
    }));
    vi.mock('../../src/storage/kv/put.js', () => ({
      default: vi.fn(() => { return 'called' })
    }));
    vi.mock('../../src/utils/auth.js', () => ({
      hasPermission: vi.fn()
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test postConfig has permission', async () => {
    const ctx = {};
    const env = {};
    const req = {};

    hasPermission.mockImplementationOnce((c, k, a, kw) => k === 'CONFIG' && a === 'write' && kw === true);

    const res = await postConfig({ req, env, daCtx: ctx });
    expect(hasPermission).toHaveBeenCalled();
    expect(res).to.eq('called');
    expect(putKv).toHaveBeenCalledWith(req, env, ctx);
  });

  it('Test getConfig has permission', async () => {
    const ctx = {};
    const env = {};

    hasPermission.mockImplementationOnce((c, k, a, kw) => k === 'CONFIG' && a === 'read' && kw === true);

    const res = await getConfig({ env, daCtx: ctx });
    expect(hasPermission).toHaveBeenCalled();
    expect(res).to.eq('called');
    expect(getKv).toHaveBeenCalledWith(env, ctx);
  });

  it('Test no permission', async () => {
    const ctx = {};
    const env = {};
    const req = {};

    hasPermission.mockImplementationOnce(() => false);

    const res = await getConfig({ env, daCtx: ctx });
    expect(getKv).not.toHaveBeenCalled();
    expect(res.status).to.eq(403);

    const res2 = await postConfig({ req, env, daCtx: ctx });
    expect(putKv).not.toHaveBeenCalled();
    expect(res2.status).to.eq(403);
  });
});
