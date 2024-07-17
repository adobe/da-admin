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

import copyObject, { copyFile } from '../../../src/storage/object/copy.js';

describe('Object Copy', () => {

  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });

  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  it('does not allow copying to the same location', async () => {
    const details = {
      source: 'mydir',
      destination: 'mydir',
    };
    const resp = await copyObject({}, {}, details, false);
    assert.strictEqual(resp.status, 409);
  });

  it('Returns 404 on missing source file', async () => {
    const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}], key: 'does-not-exist.html' };
    const details = { source: 'wknd/does-not-exist.html', destination: 'wknd/newdir/does-not-exist.html' };
    const resp = await copyObject(env, daCtx, details, false);
    assert.strictEqual(resp.status, 404);
  });

  it('Copies a file', async () => {
    const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}], key: 'index.html' };
    const details = { source: 'wknd/index.html', destination: 'wknd/newdir/index.html'};
    const resp = await copyObject(env, daCtx, details, false);
    const body = JSON.parse(resp.body);
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(body.results.length, 1);
    let head = await env.DA_CONTENT.head('wknd/index.html');
    assert(head);
    head = await env.DA_CONTENT.head('wknd/newdir/index.html');
    assert(head);
    assert.strictEqual(Object.keys(head.customMetadata).length, 0);
  });

  it('Renames a file', async () => {
    const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}], key: 'index.html' };
    const details = { source: 'wknd/index.html', destination: 'wknd/newdir/index.html'};
    const resp = await copyObject(env, daCtx, details, true);
    const body = JSON.parse(resp.body);
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(body.results.length, 1);
    let head = await env.DA_CONTENT.head('wknd/index.html');
    assert.ifError(head);
    head = await env.DA_CONTENT.head('wknd/newdir/index.html');
    assert(head);
    assert.strictEqual(Object.keys(head.customMetadata).length, 5);
  });

  it('Copies a folder', async () => {
    const daCtx = { org: 'wknd', users: [{email: "user@wknd.site"}] };
    await env.DA_CONTENT.put('wknd/wknd.props', '{"key":"value"}');
    const details = { source: 'wknd', destination: 'wknd/newdir'};
    const resp = await copyObject(env, daCtx, details, false);
    const body = JSON.parse(resp.body);
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(body.results.length, 2);
    let head = await env.DA_CONTENT.head('wknd/index.html');
    assert(head);
    head = await env.DA_CONTENT.head('wknd/wknd.props');
    assert(head);
    head = await env.DA_CONTENT.head('wknd/newdir/index.html');
    assert(head);
    head = await env.DA_CONTENT.head('wknd/newdir/wknd.props');
    assert(head);
    assert.strictEqual(Object.keys(head.customMetadata).length, 0);
  });
});
