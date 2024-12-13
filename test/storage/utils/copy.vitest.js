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
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { copyFiles, copyFile } from '../../../src/storage/utils/copy.js';

describe('Copy Utils', () => {

  describe('copyFile', () => {
    it('handles missing source', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const results = await copyFile(env, daCtx, 'does-not-exist.html', 'newdir/index.html');
      assert.strictEqual(results.success, false);
    });

    describe('No target file', () => {
      it('Copies a file (New Metadata)', async () => {
        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', origin: 'http://localhost', api: 'source', ext: 'html' };
        await env.DA_CONTENT.put(
          'wknd/index.html',
          'Hello wknd!',
          {
            httpMetadata: { contentType: 'text/html' },
            customMetadata: { id: '123', version: '123', users: `[{"email":"user@wknd.site"}]`, timestamp: '1720723249932', path: `index.html` }
          }
        );
        let copy = await env.DA_CONTENT.head('wknd/newdir/index.html');
        assert.ifError(copy);

        const results = await copyFile(env, daCtx, 'index.html', 'newdir/index.html');
        assert(results.success);
        const original = await env.DA_CONTENT.head('wknd/index.html');
        assert(original);
        copy = await env.DA_CONTENT.head('wknd/newdir/index.html');
        assert(copy);
        const { customMetadata } = copy;
        assert(customMetadata.id);
        assert(customMetadata.version);
        assert(customMetadata.timestamp);
        assert.strictEqual(customMetadata.users, JSON.stringify(daCtx.users));
        assert.strictEqual(customMetadata.path, copy.customMetadata.path);
      });

      it('Moves a file (Retains Metadata)', async () => {
        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', origin: 'http://localhost', api: 'source', ext: 'html' };
        await env.DA_CONTENT.put(
          'wknd/index.html',
          'Hello wknd!',
          {
            httpMetadata: { contentType: 'text/html' },
            customMetadata: { id: '123', version: '123', users: `[{"email":"user@wknd.site"}]`, timestamp: '1720723249932', path: `index.html` }
          }
        );
        let copy = await env.DA_CONTENT.head('wknd/newdir/index.html');
        assert.ifError(copy);

        const original = await env.DA_CONTENT.head('wknd/index.html');
        const results = await copyFile(env, daCtx, 'index.html', 'newdir/index.html', true);
        assert(results.success);
        const dropped = await env.DA_CONTENT.head('wknd/index.html');
        assert.ifError(dropped);
        copy = await env.DA_CONTENT.head('wknd/newdir/index.html');
        assert(copy);
        const { customMetadata } = copy;
        assert.strictEqual(customMetadata.id, original.customMetadata.id);
        assert.strictEqual(customMetadata.version, original.customMetadata.version);
        assert.strictEqual(customMetadata.timestamp, original.customMetadata.timestamp);
        assert.strictEqual(customMetadata.users, original.customMetadata.users);
        assert.strictEqual(customMetadata.path, copy.customMetadata.path);

        const resp = await env.dacollab.fetch('https://localhost/api/v1/deleteadmin?doc=http://localhost/source/wknd/index.html');
        assert.strictEqual(resp.status, 200);
        const text = await resp.text();
        assert.strictEqual(text, 'called');
      });
    });

    describe('With target file', () => {
      it('copies source content into target file ', async () => {
        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', origin: 'http://localhost', api: 'source', ext: 'html' };
        await env.DA_CONTENT.put(
          'wknd/index.html',
          'Hello wknd!',
          {
            httpMetadata: { contentType: 'text/html' },
            customMetadata: { id: '123', version: '123', users: `[{"email":"user@wknd.site"}]`, timestamp: '1720723249932', path: `index.html` }
          }
        );

        const head = await env.DA_CONTENT.put(
          'wknd/newdir/index.html',
          'Goodbye wknd!',
          {
            httpMetadata: { contentType: 'text/html' },
            customMetadata: { id: '987', version: '987', users: `[{"email":"user@wknd.site"}]`, timestamp: '1720723249932', path: `newdir/index.html` }
          }
        );

        const results = await copyFile(env, daCtx, 'index.html', 'newdir/index.html');
        assert(results.success);
        const original = await env.DA_CONTENT.head('wknd/index.html');
        assert(original);

        const vfile = await env.DA_CONTENT.get('wknd/.da-versions/987/987.html');
        const vtext = await vfile.text();
        assert.strictEqual(vtext, 'Goodbye wknd!');

        const copy = await env.DA_CONTENT.get('wknd/newdir/index.html');
        assert(copy);
        const text = await copy.text();
        assert.strictEqual(text, 'Hello wknd!');
        const { customMetadata } = copy;
        assert.strictEqual(customMetadata.id, head.customMetadata.id);
        assert(customMetadata.version);
        assert(customMetadata.timestamp);
        assert.strictEqual(customMetadata.users, JSON.stringify(daCtx.users));
        assert.strictEqual(customMetadata.path, copy.customMetadata.path);
        const resp = await env.dacollab.fetch('https://localhost/api/v1/syncadmin?doc=http://localhost/source/wknd/newdir/index.html');
        assert.strictEqual(resp.status, 200);
        const called = await resp.text();
        assert.strictEqual(called, 'called');
      });

      it('replaces target file and history on move', async () => {
        const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html', origin: 'http://localhost', api: 'source', ext: 'html' };
        await env.DA_CONTENT.put(
          'wknd/index.html',
          'Hello wknd!',
          {
            httpMetadata: { contentType: 'text/html' },
            customMetadata: { id: '123', version: '123', users: `[{"email":"user@wknd.site"}]`, timestamp: '1720723249932', path: `index.html` }
          }
        );

        const head = await env.DA_CONTENT.put(
          'wknd/newdir/index.html',
          'Goodbye wknd!',
          {
            httpMetadata: { contentType: 'text/html' },
            customMetadata: { id: '987', version: '987', users: `[{"email":"user@wknd.site"}]`, timestamp: '1720723249932', path: `newdir/index.html` }
          }
        );

        const results = await copyFile(env, daCtx, 'index.html', 'newdir/index.html', true);
        assert(results.success);
        const original = await env.DA_CONTENT.head('wknd/index.html');
        assert.ifError(original);

        const vfile = await env.DA_CONTENT.get('wknd/.da-versions/987/987.html');
        const vtext = await vfile.text();
        assert.strictEqual(vtext, 'Goodbye wknd!');

        const copy = await env.DA_CONTENT.get('wknd/newdir/index.html');
        assert(copy);
        const text = await copy.text();
        assert.strictEqual(text, 'Hello wknd!');
        const { customMetadata } = copy;
        assert.notStrictEqual(customMetadata.id, head.customMetadata.id);
        assert(customMetadata.version);
        assert(customMetadata.timestamp);
        assert.strictEqual(customMetadata.users, JSON.stringify(daCtx.users));
        assert.strictEqual(customMetadata.path, copy.customMetadata.path);
        let resp = await env.dacollab.fetch('https://localhost/api/v1/deleteadmin?doc=http://localhost/source/wknd/index.html');
        assert.strictEqual(resp.status, 200);
        let called = await resp.text();
        assert.strictEqual(called, 'called');

        resp = await env.dacollab.fetch('https://localhost/api/v1/syncadmin?doc=http://localhost/source/wknd/newdir/index.html');
        assert.strictEqual(resp.status, 200);
        called = await resp.text();
        assert.strictEqual(called, 'called');
      });
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
        assert.strictEqual(`${daCtx.org}/${customMetadata.path}`, copy.key);
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
        assert.strictEqual(`${daCtx.org}/${copy.customMetadata.path}`, copy.key);
        assert.strictEqual(copy.httpMetadata.contentType, 'text/html');
      }
    });
  });
});
