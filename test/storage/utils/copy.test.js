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

import { copyFiles, copyFile } from '../../../src/storage/utils/copy.js';
import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

describe('Copy Utils', () => {
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

  describe('copyFile', () => {
    it('handles missing source', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const results = await copyFile(env, daCtx, 'does-not-exist.html', 'newdir/index.html');
      assert.strictEqual(results.success, false);
    });

    it('Copies a file (New Metadata)', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const results = await copyFile(env, daCtx, 'index.html', 'newdir/index.html');
      assert(results.success);
      const original = await env.DA_CONTENT.head('wknd/index.html');
      assert(original);
      const copy = await env.DA_CONTENT.head('wknd/newdir/index.html');
      assert(copy);
      const { customMetadata } = copy;
      assert(customMetadata.id);
      assert(customMetadata.version);
      assert(customMetadata.timestamp);
      assert.strictEqual(customMetadata.users, JSON.stringify(daCtx.users));
      assert.strictEqual(customMetadata.path, copy.key);
    });

    it('Moves a file (Retains Metadata)', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const original = await env.DA_CONTENT.head('wknd/index.html');
      const results = await copyFile(env, daCtx, 'index.html', 'newdir/index.html', true);
      assert(results.success);
      const dropped = await env.DA_CONTENT.head('wknd/index.html');
      assert.ifError(dropped);
      const copy = await env.DA_CONTENT.head('wknd/newdir/index.html');
      assert(copy);
      const { customMetadata } = copy;
      assert.strictEqual(customMetadata.id, original.customMetadata.id);
      assert.strictEqual(customMetadata.version, original.customMetadata.version);
      assert.strictEqual(customMetadata.timestamp, original.customMetadata.timestamp);
      assert.strictEqual(customMetadata.users, original.customMetadata.users);
      assert.strictEqual(customMetadata.path, copy.key);
    });
  });

  describe('copyFiles', () => {
    it('handles an empty list of files', async () => {
      const results = await copyFiles(env, {}, []);
      assert.strictEqual(results.length, 0)
    });

    it('Copies a list of files', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const pageList = [];
      for (let i = 0; i < 10; i += 1) {
        const customMetadata = {
          id: i,
          version: 1,
          timestamp: `${Date.now()}`,
          users: JSON.stringify([{ email: "not-user@wknd.site" }])
        };
        const src = `pages/index${i}.html`;
        await env.DA_CONTENT.put(`${daCtx.org}/${src}`, 'HelloWorld', {
          customMetadata,
          httpMetadata: { contentType: 'text/html' }
        });
        pageList.push({ src, dest: `newdir/index${i}.html` });
      }
      const results = await copyFiles(env, daCtx, pageList);
      assert.strictEqual(results.length, 10);
      assert.ifError(results.find(r => !r.success));
      for (const { src, dest } of pageList) {
        const original = await env.DA_CONTENT.head(`${daCtx.org}/${src}`);
        assert(original);
        const copy = await env.DA_CONTENT.head(`${daCtx.org}/${dest}`);
        assert(copy);
        const { customMetadata } = copy;
        assert.notEqual(customMetadata.id, original.customMetadata.id);
        assert.notEqual(customMetadata.version, original.customMetadata.version);
        assert.notEqual(customMetadata.timestamp, original.customMetadata.timestamp);
        assert.notEqual(customMetadata.users, original.customMetadata.users);
        assert.strictEqual(customMetadata.path, copy.key);
        assert.strictEqual(copy.httpMetadata.contentType, 'text/html');
      }
    });

    it('Moves a list of files', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const pageList = [];
      const customMetadatas = [];
      for (let i = 0; i < 10; i += 1) {
        const customMetadata = {
          id: `${i}`,
          version: `${1}`,
          timestamp: `${Date.now()}`,
          users: JSON.stringify([{ email: "user@wknd.site" }])
        };
        const src = `pages/index${i}.html`;
        await env.DA_CONTENT.put(`${daCtx.org}/${src}`, 'HelloWorld', {
          customMetadata,
          httpMetadata: { contentType: 'text/html' }
        });
        pageList.push({ src, dest: `newdir/index${i}.html` });
        customMetadatas.push(customMetadata);
      }

      const results = await copyFiles(env, daCtx, pageList, true);
      assert.strictEqual(results.length, 10);
      assert.ifError(results.find(r => !r.success));

      for (let i = 0; i < pageList.length; i += 1) {
        const { src, dest } = pageList[i];
        const original = await env.DA_CONTENT.head(`${daCtx.org}/${src}`);
        assert.ifError(original);
        const copy = await env.DA_CONTENT.head(`${daCtx.org}/${dest}`);
        assert(copy);
        assert.strictEqual(copy.customMetadata.id, customMetadatas[i].id);
        assert.strictEqual(copy.customMetadata.version, customMetadatas[i].version);
        assert.strictEqual(copy.customMetadata.timestamp, customMetadatas[i].timestamp);
        assert.strictEqual(copy.customMetadata.users, customMetadatas[i].users);
        assert.strictEqual(copy.customMetadata.path, copy.key);
        assert.strictEqual(copy.httpMetadata.contentType, 'text/html');
      }
    });
  });
});
