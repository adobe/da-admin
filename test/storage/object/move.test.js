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

  describe('Move a file', () => {
    it('deletes source on success', async () => {
      const copied = [];
      const deleted = [];
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'pages/index.html', isFile: true };
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, daCtx, source, destination, isMove) => {
              assert.strictEqual(source, 'pages/index.html');
              assert.strictEqual(destination, 'newdir/index.html');
              assert(isMove);
              copied.push({ source, destination });
              return { success: true, source: `wknd/${source}`, destination: `wknd/${destination}` };
            }
          },
          '../../../src/storage/object/delete.js': {
            deleteObject: async (env, daCtx, key, isMove) => {
              assert.strictEqual(key, 'pages/index.html');
              assert(isMove);
              deleted.push(key);
            }
          }
        }
      );
      const details = { source: 'pages/index.html', destination: 'newdir/index.html' };
      const resp = await moveObject(env, daCtx, details);
      assert.deepStrictEqual(resp, { status: 204 });
      assert.deepStrictEqual(copied, [{ source: 'pages/index.html', destination: 'newdir/index.html' }]);
      assert.deepStrictEqual(deleted, ['pages/index.html']);
    });

    it('retains source on failure', async () => {
      const copied = [];
      const deleted = [];
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'pages/index.html', isFile: true };
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, daCtx, source, destination, isMove) => {
              assert.strictEqual(source, 'pages/index.html');
              assert.strictEqual(destination, 'newdir/index.html');
              assert(isMove);
              copied.push({ source, destination });
              return { success: false, source: `wknd/${source}`, destination: `wknd/${destination}` };
            }
          },
          '../../../src/storage/object/delete.js': {
            deleteObject: async () => {
              assert.fail('Should not be called');
            }
          }
        }
      );
      const details = { source: 'pages/index.html', destination: 'newdir/index.html' };
      const resp = await moveObject(env, daCtx, details);
      assert.deepStrictEqual(resp, { status: 204 });
      assert.deepStrictEqual(copied, [{ source: 'pages/index.html', destination: 'newdir/index.html' }]);
      assert.strictEqual(deleted.length, 0);
    });
  });

  describe('Move a folder', () => {
    it('removes source on copy success', async () => {
      const copied = [];
      const deleted = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, daCtx, source, destination, isMove) => {
              assert(isMove);
              copied.push({ source, destination });
              return { success: true, source: `wknd/${source}`, destination: `wknd/${destination}` };
            },
          },
          '../../../src/storage/object/delete.js': {
            deleteObject: async (env, daCtx, key, isMove) => {
              assert(isMove);
              deleted.push(key);
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
      assert.strictEqual(copied.length, 2);
      assert.strictEqual(deleted.length, 2);
    });

    it('retains source on copy failure', async () => {
      const copied = [];
      const deleted = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, daCtx, source, destination, isMove) => {
              assert(isMove);
              copied.push({ source, destination });
              return { success: true, source: `wknd/${source}`, destination: `wknd/${destination}` };
            },
          },
          '../../../src/storage/object/delete.js': {
            deleteObject: async (env, daCtx, key, isMove) => {
              assert.fail('Delete should not have been called');
              deleted.push(key);
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
      assert.strictEqual(copied.length, 2);
      assert.strictEqual(deleted.length, 0);
    });

    it('handles mix of success & failures', async function() {
      this.timeout(60000);
      let i = 0;
      const copied = [];
      const deleted = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, daCtx, source, destination, isMove) => {
              assert(isMove);
              copied.push({ source, destination });
              i += 1;
              return {
                success: (i % 2 === 0),
                source: `wknd/${source}`,
                destination: `wknd/${destination}`
              };
            }
          },
          '../../../src/storage/object/delete.js': {
            deleteObject: async (env, daCtx, key, isMove) => {
              assert(isMove);
              deleted.push(key);
            }
          },
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
      assert.strictEqual(copied.length, 103);
      assert.strictEqual(deleted.length, 51);
    });

    it('handles truncated folder list', async function() {
      this.timeout(60000);
      const copied = [];
      const deleted = [];
      const moveObject = await esmock(
        '../../../src/storage/object/move.js',
        {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, daCtx, source, destination, isMove) => {
              assert(isMove);
              copied.push({ source, destination });
              return {
                success: true,
                source: `wknd/${source}`,
                destination: `wknd/${destination}`
              };
            }
          },
          '../../../src/storage/object/delete.js': {
            deleteObject: async (env, daCtx, key, isMove) => {
              assert(isMove);
              deleted.push(key);
            }
          },
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
      assert.strictEqual(copied.length, 253);
      assert.strictEqual(deleted.length, 253);
    });
  });
});
