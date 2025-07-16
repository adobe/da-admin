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
import { getVersionList, getVersionSource, postVersionSource } from '../../src/routes/version.js';
import { listObjectVersions } from '../../src/storage/version/list.js';
import { postObjectVersion } from '../../src/storage/version/put.js';
import { getObjectVersion } from '../../src/storage/version/get.js';
import { hasPermission } from '../../src/utils/auth.js';

describe('Version Route', () => {
  beforeAll(() => {
    vi.mock('../../src/storage/version/list.js', () => ({
      listObjectVersions: vi.fn()
    }));
    vi.mock('../../src/storage/version/put.js', () => ({
      postObjectVersion: vi.fn()
    }));
    vi.mock('../../src/storage/version/get.js', () => ({
      getObjectVersion: vi.fn()
    }));
    vi.mock('../../src/utils/auth.js', async () => {
      const actual = await vi.importActual('../../src/utils/auth.js');
      return {
        ...actual,
        hasPermission: vi.fn(actual.hasPermission)
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get version list with permissions', async () => {
    listObjectVersions.mockImplementation(() => ({ status: 200 }));

    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'a/b/c.html' && a === 'read') {
        return false;
      }
      return true;
    });

    const resp = await getVersionList({ env: {}, daCtx: { key: 'a/b/c.html' }});
    expect(resp.status).to.eq(403);
    expect(listObjectVersions).not.toHaveBeenCalled();

    const resp2 = await getVersionList({ env: {}, daCtx: { key: 'a/b/c/d.html' }});
    expect(resp2.status).to.eq(200);
    expect(listObjectVersions).toHaveBeenCalledWith({}, { key: 'a/b/c/d.html' });
  });

  it('post version source with permissions', async () => {
    postObjectVersion.mockImplementation(() => ({ status: 201 }));

    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'hi.html' && a === 'write') {
        return false;
      }
      return true;
    });

    const resp = await postVersionSource({ req: {}, env: {}, daCtx: { key: 'hi.html' }});
    expect(resp.status).to.eq(403);
    expect(postObjectVersion).not.toHaveBeenCalled();

    const resp2 = await postVersionSource({ req: {}, env: {}, daCtx: { key: 'ho.html' }});
    expect(resp2.status).to.eq(201);
    expect(postObjectVersion).toHaveBeenCalledWith({}, {}, { key: 'ho.html' });
  });

  it('get version source with permission', async () => {
    hasPermission.mockImplementation((c, k, a) => {
      if (k === 'x/yyy/zzz.json' && a === 'read') {
        return false;
      }
      return true;
    });

    getObjectVersion.mockImplementation((env, daCtx, head) => {
      if (head) {
        return {
          status: 200,
          metadata: {
            path: 'huh.json'
          }
        };
      } else {
        return {
          status: 200,
          metadata: {
            path: 'x/yyy/zzz.json'
          }
        };
      }
    });

    const resp = await getVersionSource({ env: {}, daCtx: { key: 'aaaa/bbbb.html' }, head: true});
    expect(resp.status).to.eq(200);
    expect(getObjectVersion).toHaveBeenCalledWith({}, { key: 'aaaa/bbbb.html' }, true);

    const resp2 = await getVersionSource({ env: {}, daCtx: { key: 'aaaa/bbbb.html' }, head: false});
    expect(resp2.status).to.eq(403);
    expect(getObjectVersion).toHaveBeenCalledWith({}, { key: 'aaaa/bbbb.html' }, false);
  });
});
