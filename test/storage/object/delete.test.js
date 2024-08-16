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
import listObjects from '../../../src/storage/object/list.js';
import deleteObjects from '../../../src/storage/object/delete.js';

describe('delete object(s)', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });
  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  it('handles no object', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'does-not-exist.html' };
    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
  });

  it('deletes a single object', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors/index.html' };

    await env.DA_CONTENT.put('geometrixx/shapes.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/we-retail.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello');

    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
    const head = await env.DA_CONTENT.head('geometrixx/outdoors/index.html');
    assert.ifError(head);
  });

  it('deletes a single object (parameter)', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors/index.html' };

    await env.DA_CONTENT.put('geometrixx/shapes.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/we-retail.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello');

    const resp = await deleteObjects(env, daCtx, ['shapes.props']);
    assert.strictEqual(resp.status, 204);
    let head = await env.DA_CONTENT.head('geometrixx/outdoors/index.html');
    assert(head);
    head = await env.DA_CONTENT.head('geometrixx/shapes.props');
    assert.ifError(head);
  });

  it('deletes a folder', async () => {
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello!');
    await env.DA_CONTENT.put('geometrixx/outdoors/logo.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/hero.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/coats/coats.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/pants/pants.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/hats/hats.props', '{"key": "value"}');

    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors' };
    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
    const list = await env.DA_CONTENT.list({ prefix: 'geometrixx/outdoors' });
    assert.strictEqual(list.objects.length, 0);
  });

  it('does not delete a folder when passed as parameter', async () => {
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello!');
    await env.DA_CONTENT.put('geometrixx/outdoors/logo.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/hero.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/coats/coats.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/pants/pants.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/hats/hats.props', '{"key": "value"}');

    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors' };
    const resp = await deleteObjects(env, daCtx, ['outdoors']);
    assert.strictEqual(resp.status, 204);
    const list = await env.DA_CONTENT.list({ prefix: 'geometrixx/outdoors' });
    assert.strictEqual(list.objects.length, 6);
  });

  it('deletes a folder (truncated list === true)', async function() {
    this.timeout(10000);
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello!');
    for (let i = 0; i < 1000; i++) {
      await env.DA_CONTENT.put(`geometrixx/outdoors/${i}/${i}.html`, 'Content');
    }

    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors' };
    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
    const list = await env.DA_CONTENT.list({ prefix: 'geometrixx/outdoors' });
    assert.strictEqual(list.objects.length, 0);
  });

  it('deletes a list of explicit files', async () => {
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello!');
    await env.DA_CONTENT.put('geometrixx/outdoors/logo.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/hero.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/coats/coats.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/pants/pants.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/hats/hats.props', '{"key": "value"}');

    const keys = [
      'outdoors/index.html',
      'outdoors/logo.jpg',
      'outdoors/hero.jpg',
      'outdoors/coats/coats.props',
      'outdoors/pants/pants.props',
      'outdoors/hats/hats.props',
    ];
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors' };
    const resp = await deleteObjects(env, daCtx, keys);
    assert.strictEqual(resp.status, 204);
    const list = await env.DA_CONTENT.list({ prefix: 'geometrixx/outdoors' });
    assert.strictEqual(list.objects.length, 0);
  });
});
