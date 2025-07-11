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
import moveRoute from '../../src/routes/move.js';
import moveObject from '../../src/storage/object/move.js';
import moveHelper from '../../src/helpers/move.js';
import { hasPermission } from '../../src/utils/auth.js';

describe('Move Route', () => {
  beforeAll(() => {
    vi.mock('../../src/storage/object/move.js', () => ({
      default: vi.fn(() => ({ status: 200 }))
    }));
    vi.mock('../../src/helpers/move.js', () => ({
      default: vi.fn()
    }));
    vi.mock('../../src/utils/auth.js', async () => {
      const actual = await vi.importActual('../../src/utils/auth.js');
      return {
        ...actual,
        hasPermission: vi.fn()
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test moveRoute with permissions', async () => {
    const req = {
      formData: () => {
        const formdata = new Map();
        formdata.set('destination', '/someorg/somedest/');
        return formdata;
      }
    };

    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'abc.html' && a === 'write') {
        return false;
      }
      if (k === 'somedest' && a === 'write') {
        return false;
      }
      return true;
    });

    moveHelper.mockImplementation(() => ({
      source: 'abc.html',
      destination: 'somedest'
    }));

    const resp = await moveRoute({ req, env: {}, daCtx: { key: 'abc.html' }});
    expect(resp.status).to.eq(403);
    expect(moveObject).not.toHaveBeenCalled();

    moveHelper.mockImplementation(() => ({
      source: 'zzz.html',
      destination: 'somedest'
    }));

    const resp2 = await moveRoute({ req, env: {}, daCtx: { key: 'zzz.html' }});
    expect(resp2.status).to.eq(403);
    expect(moveObject).not.toHaveBeenCalled();

    const req2 = {
      formData: () => {
        const formdata = new Map();
        formdata.set('destination', '/someorg/someotherdest/');
        return formdata;
      }
    };

    moveHelper.mockImplementation(() => ({
      source: 'abc.html',
      destination: 'someotherdest'
    }));

    const resp3 = await moveRoute({ req: req2, env: {}, daCtx: { key: 'abc.html' }});
    expect(resp3.status).to.eq(403);
    expect(moveObject).not.toHaveBeenCalled();

    moveHelper.mockImplementation(() => ({
      source: 'zzz.html',
      destination: 'someotherdest'
    }));

    const resp4 = await moveRoute({ req: req2, env: {}, daCtx: { key: 'zzz.html' }});
    expect(resp4.status).to.eq(200);
    expect(moveObject).toHaveBeenCalledWith({}, { key: 'zzz.html' }, {
      source: 'zzz.html',
      destination: 'someotherdest'
    });
  });
});
