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

import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

import copyObject from '../../../src/storage/object/copy.js';

describe('Object copy', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });

  afterEach(async function () {
    this.timeout(60000);
    await destroyMiniflare(mf);
  });

  it('does not allow copying to the same location', async () => {
    const details = {
      source: 'mydir',
      destination: 'mydir',
    };
    const resp = await copyObject({}, {}, details);
    assert.strictEqual(resp.status, 409);
  });

  describe('copy', () => {

    it('handles missing source', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const details = { source: 'wknd/does-not-exist.html', destination: 'wknd/newdir/index.html' };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
    });

    it('Copies a file', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const details = { source: 'wknd/index.html', destination: 'wknd/newdir/index.html' };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
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

    it('Copies a folder', async () => {
      const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'wknd', destination: 'wknd/newdir'};
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      let head = await env.DA_CONTENT.head('wknd/index.html');
      assert(head);
      head = await env.DA_CONTENT.head('wknd.props');
      assert(head);
      head = await env.DA_CONTENT.head('wknd/newdir/index.html');
      assert(head);
      head = await env.DA_CONTENT.head('wknd/newdir.props');
      assert(head);
    });

    it ('handles long list of copying', async function () {
      this.timeout(90000);
      const max = 500;
      const min = 100;
      const limit = Math.floor(Math.random() * (max - min) + min);
      // Prep the content.
      for (let i = 0; i < limit; i++) {
        await env.DA_CONTENT.put(`wknd/pages/index${i}.html`, 'content');
      }

      const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'wknd', destination: 'wknd-newdir'};
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      let head = await env.DA_CONTENT.head('wknd.props');
      assert(head);
      head = await env.DA_CONTENT.head('wknd-newdir.props');
      assert(head);
      head = await env.DA_CONTENT.head('wknd-newdir/index.html');
      assert(head);
    });
  });

  describe('rename', () => {
    it('Renames a file', async () => {
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'index.html' };
      const details = { source: 'wknd/index.html', destination: 'wknd/newdir/index.html' };
      const original = await env.DA_CONTENT.head('wknd/index.html');

      const resp = await copyObject(env, daCtx, details, true);
      assert.strictEqual(resp.status, 204);
      const removed = await env.DA_CONTENT.head('wknd/index.html');
      assert.ifError(removed);
      const renamed = await env.DA_CONTENT.head('wknd/newdir/index.html');
      assert(renamed);
      const { customMetadata } = renamed;
      assert.strictEqual(customMetadata.id, original.customMetadata.id);
      assert.strictEqual(customMetadata.version, original.customMetadata.version);
      assert.strictEqual(customMetadata.timestamp, original.customMetadata.timestamp);
      assert.strictEqual(customMetadata.users, original.customMetadata.users);
      assert.strictEqual(customMetadata.path, 'wknd/newdir/index.html');
    });

    it('Renames a folder', async () => {
      const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'wknd', destination: 'wknd/newdir'};
      const resp = await copyObject(env, daCtx, details, true);
      assert.strictEqual(resp.status, 204);
      let r2o = await env.DA_CONTENT.list({prefix: 'wknd/', delimiter: '/'});
      assert.strictEqual(r2o.truncated, false)
      assert.deepStrictEqual(r2o.objects.length, 1);
      assert.strictEqual(r2o.objects[0].key, 'wknd/newdir.props')

      const head = await env.DA_CONTENT.head('wknd.props');
      assert.ifError(head);

      r2o = await env.DA_CONTENT.list({prefix: 'wknd/newdir/'});
      assert.strictEqual(r2o.truncated, false)
      assert.deepStrictEqual(r2o.objects.length, 1);
      let renamed = await env.DA_CONTENT.head('wknd/newdir/index.html');
      assert(renamed);
      renamed = await env.DA_CONTENT.head('wknd/newdir.props');
      assert(renamed)
    });

    it('handles long list of renaming', async function() {
      this.timeout(90000);
      const max = 500;
      const min = 100;
      const limit = Math.floor(Math.random() * (max - min) + min);
      // Prep the content.
      for (let i = 0; i < limit; i++) {
        await env.DA_CONTENT.put(`wknd/pages/index${i}.html`, 'content');
      }

      const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'wknd', destination: 'wknd-newdir'};
      const resp = await copyObject(env, daCtx, details, true);
      assert.strictEqual(resp.status, 204);

      let r2o = await env.DA_CONTENT.list({prefix: 'wknd/' });
      assert.strictEqual(r2o.truncated, false)

      let cursor;
      let total = 0;
      do {
        r2o = await env.DA_CONTENT.list({ prefix: 'wknd-newdir/', cursor });
        total += r2o.objects.length;
        cursor = r2o.cursor;
      } while (r2o.truncated);

      assert.deepStrictEqual(total, limit + 1);
      let renamed = await env.DA_CONTENT.head('wknd-newdir/index.html');
      assert(renamed);
      renamed = await env.DA_CONTENT.head('wknd-newdir.props');
      assert(renamed);
    });
  });
});
