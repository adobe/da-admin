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
import esmock from 'esmock';

describe('Version Route', () => {
  it('get version list with permissions', async () => {
    const lovCalled = [];
    const listObjectVersions = (e, c) => {
      lovCalled.push({e, c});
      return { status: 200 };
    };
    const hasPermission = (c, k, a) => {
      if (k === 'a/b/c.html' && a === 'read') {
        return false;
      }
      return true;
    };

    const { getVersionList } = await esmock(
      '../../src/routes/version.js', {
        '../../src/storage/version/list.js': {
          listObjectVersions
        },
        '../../src/utils/auth.js': {
          hasPermission
        },
      }
    );

    const resp = await getVersionList({ env: {}, daCtx: { key: 'a/b/c.html' }});
    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, lovCalled.length);

    const resp2 = await getVersionList({ env: {}, daCtx: { key: 'a/b/c/d.html' }});
    assert.strictEqual(200, resp2.status);
    assert.strictEqual(1, lovCalled.length);
    assert.strictEqual('a/b/c/d.html', lovCalled[0].c.key);
  });

  it('post version source with permissions', async () => {
    const povCalled = [];
    const postObjectVersion = (r, e, c) => {
      povCalled.push({r, e, c});
      return { status: 201 };
    };
    const hasPermission = (c, k, a) => {
      if (k === 'hi.html' && a === 'write') {
        return false;
      }
      return true;
    };

    const { postVersionSource } = await esmock(
      '../../src/routes/version.js', {
        '../../src/storage/version/put.js': {
          postObjectVersion
        },
        '../../src/utils/auth.js': {
          hasPermission
        },
      }
    );

    const resp = await postVersionSource({ req: {}, env: {}, daCtx: { key: 'hi.html' }});
    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, povCalled.length);

    const resp2 = await postVersionSource({ req: {}, env: {}, daCtx: { key: 'ho.html' }});
    assert.strictEqual(201, resp2.status);
    assert.strictEqual(1, povCalled.length);
    assert.strictEqual('ho.html', povCalled[0].c.key);
  });

  it('get version source with permission', async () => {
    let mdPath;
    const govCalled = [];
    const getObjectVersion = (e, c, h) => {
      govCalled.push({e, c, h});
      return {
        status: 200,
        metadata: {
          path: mdPath
        }
      }
    };
    const hasPermission = (c, k, a) => {
      if (k === 'x/yyy/zzz.json' && a === 'read') {
        return false;
      }
      return true;
    };

    const { getVersionSource } = await esmock(
      '../../src/routes/version.js', {
        '../../src/storage/version/get.js': {
          getObjectVersion
        },
        '../../src/utils/auth.js': {
          hasPermission
        },
      }
    );

    mdPath = 'huh.json';
    const resp = await getVersionSource({ env: {}, daCtx: { key: 'aaaa/bbbb.html' }, head: true});
    assert.strictEqual(200, resp.status);
    assert.strictEqual(1, govCalled.length);
    assert.strictEqual('aaaa/bbbb.html', govCalled[0].c.key);
    assert(govCalled[0].h);

    mdPath = 'x/yyy/zzz.json';
    const resp2 = await getVersionSource({ env: {}, daCtx: { key: 'aaaa/bbbb.html' }, head: false});
    assert.strictEqual(403, resp2.status);
    assert.strictEqual(2, govCalled.length);
    assert.strictEqual('aaaa/bbbb.html', govCalled[1].c.key);
    assert(!govCalled[1].h);
  });
});
