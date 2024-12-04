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

import assert from 'node:assert';
import esmock from 'esmock';

import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

describe('Object copy', () => {
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

  it('does not allow copying to the same location', async () => {
    const copyObject = await esmock('../../../src/storage/object/copy.js', {});
    const details = {
      source: 'mydir',
      destination: 'mydir',
    };
    const resp = await copyObject({}, {}, details);
    assert.strictEqual(resp.status, 409);
  });

  describe('copy', () => {
    it('Copies a file', async () => {
      let copyCalled = false;
      const copyObject = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/utils/copy.js': {
          copyFile: async (env, ctx, source, destination, isMove) => {
            copyCalled = true;
            assert.strictEqual(isMove, false);
            assert.strictEqual(source, 'index.html');
            assert.strictEqual(destination, 'newdir/index.html');
            return {
              success: true,
              source: `wknd/${source}`,
              destination: `wknd/${destination}`
            };
          }
        },
      });

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', isFile: true };
      const details = { source: 'index.html', destination: 'newdir/index.html' };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert(copyCalled);
    });

    it('Copies a (small) folder', async () => {
      let list = [];
      const copyObject = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/utils/copy.js': {
          copyFiles: async (env, ctx, files) => {
            list.push(...files);
            return files.map((item) => ({
              success: true,
              source: `wknd/${item.src}`,
              destination: `wknd/${item.dest}`
            }));
          }
        },
      });

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
      await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
      await env.DA_CONTENT.put('wknd/originaldir/index.html', 'Hello World');
      const details = { source: 'originaldir', destination: 'newdir' };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(list.length, 2);
    });

    it(`copies a folder (truncated), no continuation token`, async function() {
      this.timeout(60000);
      let list = [];
      const copyObject = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/utils/copy.js': {
          copyFiles: async (env, ctx, files) => {
            list.push(...files);
            return files.map((item) => ({
              success: true,
              source: `wknd/${item.src}`,
              destination: `wknd/${item.dest}`
            }));
          }
        },
      });
      for (let i = 0; i < 250; i++) {
        await env.DA_CONTENT.put(`wknd/pages/index${i}.html`, 'content');
      }
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'pages', destination: 'pages-newdir' };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 206);
      assert.strictEqual(list.length, 101);
      const body = JSON.parse(resp.body);
      assert(body.continuationToken);
      const jobData = await env.DA_JOBS.get(body.continuationToken);
      const remaining = JSON.parse(jobData);
      assert.strictEqual(remaining.length, 150);
    });

    it(`copies a folder (truncated), continuation token`, async function() {
      const continuationToken = 'token';
      this.timeout(60000);
      let list = [];
      const copyObject = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/utils/copy.js': {
          copyFiles: async (env, ctx, files) => {
            list.push(...files);
            return files.map((item) => ({
              success: true,
              source: `wknd/${item.src}`,
              destination: `wknd/${item.dest}`
            }));
          }
        },
      });
      const copyList = [];
      for (let i = 0; i < 250; i++) {
        const src = `wknd/pages/index${i}.html`
        copyList.push(src);
        await env.DA_CONTENT.put(src, 'content');
      }
      await env.DA_JOBS.put(continuationToken, JSON.stringify(copyList));
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'pages', destination: 'pages-newdir', continuationToken };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 206);
      assert.strictEqual(list.length, 100);
      const jobs = await env.DA_JOBS.get(continuationToken);
      const jobData = JSON.parse(jobs);
      assert.strictEqual(jobData.length, 150);
    });

    it(`copies a folder (not truncated), continuation token`, async function() {
      const continuationToken = 'token';
      this.timeout(60000);
      let list = [];
      const copyObject = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/utils/copy.js': {
          copyFiles: async (env, ctx, files) => {
            list.push(...files);
            return files.map((item) => ({
              success: true,
              source: `wknd/${item.src}`,
              destination: `wknd/${item.dest}`
            }));
          }
        },
      });
      const copyList = [];
      for (let i = 0; i < 50; i++) {
        const src = `wknd/pages/index${i}.html`
        copyList.push(src);
        await env.DA_CONTENT.put(src, 'content');
      }
      await env.DA_JOBS.put(continuationToken, JSON.stringify(copyList));
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'pages', destination: 'pages-newdir', continuationToken };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(list.length, 50);
      const jobs = await env.DA_JOBS.get(continuationToken);
      assert.ifError(jobs);
    });
  });

  describe('rename', () => {
    describe('single file', () => {
      it('removes source on copy success', async () => {
        let copyCalled = false;
        const copyObject = await esmock('../../../src/storage/object/copy.js', {
          '../../../src/storage/utils/copy.js': {
            copyFile: async (env, ctx, source, destination, isMove) => {
              copyCalled = true;
              assert(isMove);
              assert.strictEqual(source, 'index.html');
              assert.strictEqual(destination, 'newdir/index.html');
              return {
                success: true,
                source: `wknd/${source}`,
                destination: `wknd/${destination}`
              };
            }
          },
        });

        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', isFile: true };
        const details = { source: 'index.html', destination: 'newdir/index.html' };
        const resp = await copyObject(env, daCtx, details, true);
        assert.strictEqual(resp.status, 204);
        assert(copyCalled);
      });

      it('retains source on copy failure', async () => {
        let copyCalled = false;
        const copyObject = await esmock('../../../src/storage/object/copy.js', {
          '../../../src/storage/utils/copy.js': {
            copyFile: async () => {
              copyCalled = true;
              return { success: false };
            }
          },
        });

        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', isFile: true };
        const details = { source: 'index.html', destination: 'newdir/index.html' };
        const resp = await copyObject(env, daCtx, details, true);
        assert.strictEqual(resp.status, 204);
        assert(copyCalled);
        const kept = await env.DA_CONTENT.head('wknd/index.html');
        assert(kept);
      });
    });

    describe('folder', () => {
      it('moves files', async () => {
        const list = [];
        const copyObject = await esmock('../../../src/storage/object/copy.js', {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, ctx, files, isRename) => {
              assert(isRename)
              list.push(...files);
            }
          },
        });
        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], isFile: false };
        await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
        await env.DA_CONTENT.put('wknd/originaldir/index.html', 'Hello World');
        const details = { source: 'originaldir', destination: 'newdir' };
        const resp = await copyObject(env, daCtx, details, true);
        assert.strictEqual(resp.status, 204);
        assert.strictEqual(list.length, 2);
      });

      it(`handles truncated folder list`, async function() {
        this.timeout(60000);
        let list = [];
        const copyObject = await esmock('../../../src/storage/object/copy.js', {
          '../../../src/storage/utils/copy.js': {
            copyFiles: async (env, ctx, files, isRename) => {
              assert(isRename)
              list.push(...files);
            }
          },
        });
        const promises = [];
        for (let i = 0; i < 101; i++) {
          promises.push(env.DA_CONTENT.put(`wknd/pages/index${i}.html`, 'content'));
        }
        await Promise.all(promises);

        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }] };
        await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
        await env.DA_CONTENT.put('wknd/pages/index.html', 'HelloWorld');
        const details = { source: 'pages', destination: 'pages-newdir' };
        const resp = await copyObject(env, daCtx, details, true);
        assert.strictEqual(resp.status, 206);
        assert.strictEqual(list.length, 101);
      });
    });
  });
});
