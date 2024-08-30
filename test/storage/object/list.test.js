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


describe('list objects', () => {
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
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'does-not-exist', key: '' };

    const resp = await listObjects(env, daCtx);
    assert.strictEqual(resp.length, 0);
  });

  it('lists bucket contents (e.g. Sites)', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: '' };

    await env.DA_CONTENT.put('geometrixx/shapes.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/we-retail.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello');

    const data = await listObjects(env, daCtx);
    assert(data[0].lastModified);
    delete data[0].lastModified;
    assert.deepStrictEqual(data[0], { name: 'index', ext: 'html', path: '/geometrixx/index.html' }); // Default miniflare content
    assert.deepStrictEqual(data[1], { name: 'outdoors', path: '/geometrixx/outdoors' })
    assert.deepStrictEqual(data[2], { name: 'shapes', path: '/geometrixx/shapes' });
    assert.deepStrictEqual(data[3], { name: 'we-retail', path: '/geometrixx/we-retail' });
  });

  it('lists site content (e.g pages/folders/etc)', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors' };

    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello!');
    await env.DA_CONTENT.put('geometrixx/outdoors/logo.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/hero.jpg', '1234');
    await env.DA_CONTENT.put('geometrixx/outdoors/coats/coats.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/pants/pants.props', '{"key": "value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/hats/hats.props', '{"key": "value"}');

    const data = await listObjects(env, daCtx);
    assert.deepStrictEqual(data[0], { name: 'coats', path: '/geometrixx/outdoors/coats' })
    assert.deepStrictEqual(data[1], { name: 'hats', path: '/geometrixx/outdoors/hats' });
    assert(data[2].lastModified);
    delete data[2].lastModified;
    assert.deepStrictEqual(data[2], { name: 'hero', ext: 'jpg', path: '/geometrixx/outdoors/hero.jpg' });
    assert(data[3].lastModified);
    delete data[3].lastModified;
    assert.deepStrictEqual(data[3], { name: 'index', ext: 'html', path: '/geometrixx/outdoors/index.html' });
    assert(data[4].lastModified);
    delete data[4].lastModified;
    assert.deepStrictEqual(data[4], { name: 'logo', ext: 'jpg', path: '/geometrixx/outdoors/logo.jpg' });
    assert.deepStrictEqual(data[5], { name: 'pants', path: '/geometrixx/outdoors/pants' });
  });
});
