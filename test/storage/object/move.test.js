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
            return { success: true, source: `wknd/${source}`, destination: `wknd/${destination}` };
          }
        }
      }
    );
    const details = { source: 'pages/index.html', destination: 'newdir/index.html' };

    const resp = await moveObject(env, daCtx, details);
    assert.deepStrictEqual(resp, { status: 204 });
  });

  describe('Moves a folder', () => {
    it('removes source on copy success', async () => {
      const list = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, daCtx, files, retainMetadata) => {
              assert(retainMetadata);
              list.push(...files);
              assert.strictEqual(files.length, 2);
              assert(files.find(({ src, dest }) => src === 'originaldir.props' && dest === 'newdir.props'));
              assert(files.find(({ src, dest }) => src === 'originaldir/index.html' && dest === 'newdir/index.html'));
              return files.map((item, idx) => ({
                success: true,
                source: `wknd/${item.src}`,
                destination: `wknd/${item.dest}`
              }));
            }
          }
        }
      );

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
      await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
      await env.DA_CONTENT.put('wknd/originaldir/index.html', 'HelloWorld');

      const details = { source: 'originaldir', destination: 'newdir' };
      const resp = await moveObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(list.length, 2);
      let head = await env.DA_CONTENT.head('wknd/originaldir.props');
      assert.ifError(head);
      head = await env.DA_CONTENT.head('wknd/originaldir/index.html');
      assert.ifError(head);
    });

    it('retains source on copy failure', async () => {
      const list = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, daCtx, files, retainMetadata) => {
              assert(retainMetadata);
              list.push(...files);
              assert.strictEqual(files.length, 2);
              assert(files.find(({ src, dest }) => src === 'originaldir.props' && dest === 'newdir.props'));
              assert(files.find(({ src, dest }) => src === 'originaldir/index.html' && dest === 'newdir/index.html'));
              return files.map((item, idx) => ({
                success: false,
                source: `wknd/${item.src}`,
                destination: `wknd/${item.dest}`
              }));
            }
          }
        }
      );

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
      await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
      await env.DA_CONTENT.put('wknd/originaldir/index.html', 'HelloWorld');

      const details = { source: 'originaldir', destination: 'newdir' };
      const resp = await moveObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(list.length, 2);
      let head = await env.DA_CONTENT.head('wknd/originaldir.props');
      assert(head);
      head = await env.DA_CONTENT.head('wknd/originaldir/index.html');
      assert(head);
    });

    it('handles mix of success & failures', async function() {
      this.timeout(60000);
      const list = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, daCtx, files, retainMetadata) => {
              assert(retainMetadata);
              list.push(...files);
              return files.map((item, idx) => ({
                success: (idx % 2 === 0),
                source: `wknd/${item.src}`,
                destination: `wknd/${item.dest}`
              }));
            }
          }
        }
      );
      const promises = [];
      for (let i = 0; i < 101; i++) {
        promises.push(env.DA_CONTENT.put(`wknd/originaldir/index${i}.html`, 'content'));
      }
      await Promise.all(promises);

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
      await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
      await env.DA_CONTENT.put('wknd/originaldir/index.html', 'HelloWorld');

      const details = { source: 'originaldir', destination: 'newdir' };
      const resp = await moveObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(list.length, 103);
      const r2o = await env.DA_CONTENT.list({ prefix: 'wknd/originaldir/' });
      assert.strictEqual(r2o.objects.length, 51); // Even indices are successful
    });

    it('handles truncated folder list', async function() {
      this.timeout(60000);
      const list = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, daCtx, files, retainMetadata) => {
              assert(retainMetadata);
              list.push(...files);
              return files.map((item, idx) => ({
                success: true,
                source: `wknd/${item.src}`,
                destination: `wknd/${item.dest}`
              }));
            }
          }
        }
      );
      for (let i = 0; i < 251; i++) {
        await env.DA_CONTENT.put(`wknd/originaldir/index${i}.html`, 'content');
      }

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
      await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
      await env.DA_CONTENT.put('wknd/originaldir/index.html', 'HelloWorld');

      const details = { source: 'originaldir', destination: 'newdir' };
      const resp = await moveObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(list.length, 253);

      const r2o = await env.DA_CONTENT.list({ prefix: 'wknd/originaldir/' });
      assert.strictEqual(r2o.truncated, false);
      assert.strictEqual(r2o.objects.length, 0);
    });
  });
});
