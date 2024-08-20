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

  afterEach(async function() {
    this.timeout(60000);
    await destroyMiniflare(mf);
  });


  describe('copy performance', () => {
    const limit = 10000;
    beforeEach(async function() {
      this.timeout(60000);
      // Prep the content.
      for (let i = 0; i < limit; i += 100) {
        for (let j = 0; j < 100; j++) {
          const promises = [];
          promises.push(env.DA_CONTENT.put(`wknd/pages/index${i + j}.html`, 'content'));
          await Promise.all(promises);
        }
      }
    });

    it(`copy handles ${limit} files in folder`, async function() {
      this.timeout(60000);
      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'pages', destination: 'pages-newdir' };
      const resp = await copyObject(env, daCtx, details);
      assert.strictEqual(resp.status, 204);
      const head = await env.DA_CONTENT.head('wknd/pages-newdir/index1.html');
      assert(head);
    });
  });

  describe('rename performance', () => {

    const limit = 10000;
    beforeEach(async function() {
      this.timeout(60000);
      // Prep the content.
      for (let i = 0; i < limit; i += 100) {
        for (let j = 0; j < 100; j++) {
          const promises = [];
          promises.push(env.DA_CONTENT.put(`wknd/pages/index${i + j}.html`, 'content'));
          await Promise.all(promises);
        }
      }
    });

    it(`rename handles ${limit} files in folder`, async function() {
      this.timeout(60000);

      const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }] };
      await env.DA_CONTENT.put('wknd.props', '{"key":"value"}');
      const details = { source: 'pages', destination: 'pages-newdir' };
      const resp = await copyObject(env, daCtx, details, true);
      assert.strictEqual(resp.status, 204);

      let r2o = await env.DA_CONTENT.list({ prefix: 'wknd/pages/' });
      assert.strictEqual(r2o.truncated, false)

      let cursor;
      let total = 0;
      do {
        r2o = await env.DA_CONTENT.list({ prefix: 'wknd/pages-newdir/', cursor });
        total += r2o.objects.length;
        cursor = r2o.cursor;
      } while (r2o.truncated);

      assert.deepStrictEqual(total, limit);
      let renamed = await env.DA_CONTENT.head('wknd/pages-newdir/index1.html');
      assert(renamed);
    });
  });
});
