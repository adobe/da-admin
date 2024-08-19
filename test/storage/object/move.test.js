/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import assert from 'node:assert';
import esmock from 'esmock';

import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';


describe('Object move', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });

  afterEach(async function() {
    this.timeout(60000);
    await destroyMiniflare(mf);
  });

  it('Moves a file', async () => {
    const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'pages/index.html', isFile: true };
    const moveObject = await esmock(
      '../../../src/storage/object/move.js',
      {
        '../../../src/storage/utils/copy.js': {
          copyFile: async (env, daCtx, source, destination, isMove) => {
            assert(isMove);
            assert.strictEqual(source, 'pages/index.html');
            assert.strictEqual(destination, 'newdir/index.html');
            return { success: true, source, destination };
          }
        }
      }
    );
    const details = { source: 'pages/index.html', destination: 'newdir/index.html' };

    const resp = await moveObject(env, daCtx, details);
    assert.deepStrictEqual(resp, { status: 204 });
  });

  it('Moves a folder', async () => {
    const moveObject = await esmock(
      '../../../src/storage/object/move.js',
      {
        '../../../src/storage/utils/copy.js': {
          copyFiles: async (env, daCtx, list, isMove) => {
            assert(isMove);
            assert.strictEqual(list.length, 2);
            assert(list.find(({ src, dest }) => src === 'originaldir.props' && dest === 'newdir.props'));
            assert(list.find(({ src, dest }) => src === 'originaldir/index.html' && dest === 'newdir/index.html'));
            return list.map((item) =>  ({ success: true, source: item.src, destination: item.dest }));
          }
        }
      }
    );

    const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
    await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
    const originalMetadata = {
      id: '123',
      version: '1',
      timestamp: '123',
      users: JSON.stringify(daCtx.users),
      path: 'wknd/originaldir/index.html'
    };
    await env.DA_CONTENT.put('wknd/originaldir/index.html', 'HelloWorld', {
      customMetadata: originalMetadata,
      httpMetadata: { contentType: 'text/html' }
    });

    const details = { source: 'originaldir', destination: 'newdir' };
    const resp = await moveObject(env, daCtx, details);
    assert.strictEqual(resp.status, 204);
  });

  describe('performance', () => {
    const max = 10000;
    const min = 5000;
    const limit = Math.floor(Math.random() * (max - min) + min);

    beforeEach(async function() {
      this.timeout(60000);
      // Prep the content.
      for (let i = 0; i < limit; i++) {
        await env.DA_CONTENT.put(`wknd/pages/index${i}.html`, 'content');
      }
    });

    it(`move handles ${limit} files in folder`, async function() {
      this.timeout(60000);

      let count = 0;
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, daCtx, list, isMove) => {
              assert(isMove);
              await env.DA_CONTENT.delete(list.map(({ src }) => `${daCtx.org}/${src}`));
              count += list.length;
              return list.map((item) => ({ success: true, source: item.src, destination: item.dest }));
            }
          }
        }
      );

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
      const details = { source: 'pages', destination: 'pages-newdir' };
      const resp = await moveObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.deepStrictEqual(count, limit + 1); // +1 for the props file.
    });
  });
});
