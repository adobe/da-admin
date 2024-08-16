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

import moveObject from '../../../src/storage/object/move.js';
import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';
const max = 10000;
const min = 5000;
const limit = Math.floor(Math.random() * (max - min) + min);

describe('Object move', () => {
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

  it('Moves a file', async () => {
    const daCtx = { org: 'wknd', users: [{ email: "user@wknd.site" }], key: 'pages/index.html', isFile: true };

    const originalMetadata = { id: '123', version: '1', timestamp: '123', users: JSON.stringify(daCtx.users), path: 'wknd/pages/index.html' };
    await env.DA_CONTENT.put('wknd/pages/index.html', 'HelloWorld', { customMetadata: originalMetadata, httpMetadata: { contentType: 'text/html' } });

    const details = { source: 'pages/index.html', destination: 'newdir/index.html' };

    const resp = await moveObject(env, daCtx, details);
    assert.strictEqual(resp.status, 204);
    const removed = await env.DA_CONTENT.head('wknd/pages/index.html');
    assert.ifError(removed);
    const renamed = await env.DA_CONTENT.head('wknd/newdir/index.html');
    assert(renamed);
    const { customMetadata } = renamed;
    assert.strictEqual(customMetadata.id, originalMetadata.id);
    assert.strictEqual(customMetadata.version, originalMetadata.version);
    assert.strictEqual(customMetadata.timestamp, originalMetadata.timestamp);
    assert.strictEqual(customMetadata.users, originalMetadata.users);
    assert.strictEqual(customMetadata.path, 'wknd/newdir/index.html');
    assert.strictEqual(renamed.httpMetadata.contentType, 'text/html');
  });

  it('Moves a folder', async () => {
    const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}], isFile: false};
    await env.DA_CONTENT.put('wknd/originaldir.props', '{"key":"value"}');
    const originalMetadata = { id: '123', version: '1', timestamp: '123', users: JSON.stringify(daCtx.users), path: 'wknd/originaldir/index.html' };
    await env.DA_CONTENT.put('wknd/originaldir/index.html', 'HelloWorld', { customMetadata: originalMetadata, httpMetadata: { contentType: 'text/html' } });

    const details = { source: 'originaldir', destination: 'newdir'};
    const resp = await moveObject(env, daCtx, details);
    assert.strictEqual(resp.status, 204);

    // Deleted the original folder contents
    let r2o = await env.DA_CONTENT.list({prefix: 'wknd/originaldir/'});
    assert.strictEqual(r2o.truncated, false)
    assert.deepStrictEqual(r2o.objects.length, 0);
    const head = await env.DA_CONTENT.head('wknd/originaldir.props');
    assert.ifError(head);

    // New folder created with contents
    r2o = await env.DA_CONTENT.list({prefix: 'wknd/newdir/'});
    assert.strictEqual(r2o.truncated, false)
    assert.deepStrictEqual(r2o.objects.length, 1);
    let renamed = await env.DA_CONTENT.head('wknd/newdir/index.html');
    assert(renamed);
    assert(renamed.customMetadata.path, 'wknd/newdir/index.html');
    renamed = await env.DA_CONTENT.head('wknd/newdir.props');
    assert(renamed)
  });

  it(`move handles ${limit} files in folder`, async function() {
    this.timeout(90000);
    // Prep the content.
    for (let i = 0; i < limit; i++) {
      await env.DA_CONTENT.put(`wknd/pages/index${i}.html`, 'content');
    }
    const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}], isFile: false };
    const details = { source: 'pages', destination: 'pages-newdir'};
    const resp = await moveObject(env, daCtx, details);
    assert.strictEqual(resp.status, 204);

    let r2o = await env.DA_CONTENT.list({prefix: 'wknd/pages/' });
    assert.strictEqual(r2o.truncated, false)
    assert.strictEqual(r2o.objects.length, 0);

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
