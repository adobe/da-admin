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
import copyHandler from '../../src/routes/copy.js';
import copy from '../../src/storage/object/copy.js';
import { hasPermission } from "../../src/utils/auth.js";

describe('Copy Route', () => {

  beforeAll(() => {
    vi.mock('../../src/storage/object/copy.js', () => ({
      default: vi.fn(),
    }))
    vi.mock('../../src/utils/auth.js', () => ({
      hasPermission: vi.fn(),
    }))
  });

  afterEach(() => {
    vi.resetAllMocks();
  })

  it('Test copyHandler with permissions', async () => {
    copy.mockImplementation(() => ({ status: 200 }));

    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'my/src.html' && a === 'read') {
        return false;
      }
      if (k === 'my/dest.html' && a === 'write') {
        return false;
      }
      return true;
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/MY/dest.html')
    const req = {
      formData: () => formdata
    };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'my/src.html' }});
    expect(resp.status).to.eq(403);
    expect(copy).not.toHaveBeenCalled();

    const resp2 = await copyHandler({ req, env: {}, daCtx: { key: 'my/src2.html' }});
    expect(resp2.status).to.eq(403);
    expect(copy).not.toHaveBeenCalled();

    const formdata2 = new Map();
    formdata2.set('destination', '/myorg/MY/dest2.html')
    const req2 = {
      formData: () => formdata2
    };

    const resp3 = await copyHandler({ req: req2, env: {}, daCtx: { key: 'my/src.html' }});
    expect(resp3.status).to.eq(403);
    expect(copy).not.toHaveBeenCalled();

    const resp4 = await copyHandler({ req: req2, env: {}, daCtx: { key: 'my/src2.html' }});
    expect(resp4.status).to.eq(200);
    expect(copy).toHaveBeenCalled();
    expect(copy.mock.calls[0][2].source).to.eq('my/src2.html');
    expect(copy.mock.calls[0][2].destination).to.eq('my/dest2.html');
    expect(copy.mock.calls[0][3]).to.be.false;
  });
});
