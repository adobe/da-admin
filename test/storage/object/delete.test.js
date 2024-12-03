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
import { postObjectVersionWithLabel } from '../../../src/storage/version/put.js';
import { version } from '@redocly/cli/lib/utils/update-version-notifier.js';

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
    const collabCalls = [];
    const deleteObjects = await esmock(
      '../../../src/storage/object/delete.js', {
        '../../../src/storage/utils/collab.js': {
          deleteFromCollab: async (env, daCtx, key) => {
            collabCalls.push(key);
          },
        },
      },
    );

    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'does-not-exist.html' };
    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(collabCalls.length, 2);
  });

  it('deletes a single object', async () => {
    const collabCalls = [];
    const versionCalls = [];
    const deleteObjects = await esmock(
      '../../../src/storage/object/delete.js', {
        '../../../src/storage/utils/collab.js': {
          deleteFromCollab: async (env, daCtx, key) => {
            collabCalls.push(key);
          },
        },
        '../../../src/storage/version/put.js': {
          postObjectVersionWithLabel: async (env, daCtx, label) => {
            assert.strictEqual(label, 'Deleted');
            versionCalls.push(daCtx.key)
          },
        },
      },
    );
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors/index.html' };

    await env.DA_CONTENT.put('geometrixx/shapes.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/we-retail.props', '{"key":"value"}');
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello');

    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
    assert(collabCalls.includes('geometrixx/outdoors/index.html'));
    assert.strictEqual(versionCalls.length, 1);
    assert.strictEqual(versionCalls[0], 'outdoors/index.html');
  });

  it('deletes a folder', async () => {
    const collabCalls = [];
    const versionCalls = [];
    const deleteObjects = await esmock(
      '../../../src/storage/object/delete.js', {
        '../../../src/storage/utils/collab.js': {
          deleteFromCollab: async (env, daCtx, key) => {
            collabCalls.push(key);
          },
        },
        '../../../src/storage/version/put.js': {
          postObjectVersionWithLabel: async (env, daCtx, label) => {
            assert.strictEqual(label, 'Deleted');
            versionCalls.push(daCtx.key)
          },
        },
      },
    );

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
    assert.strictEqual(collabCalls.length, 8); // 1 for each file, 1 for the folder & props
    assert.strictEqual(versionCalls.length, 3); // 1 for each file, 1 for the folder & props
  });

  it('deletes a folder (truncated list === true)', async function() {
    const collabCalls = [];
    const versionCalls = [];
    const deleteObjects = await esmock(
      '../../../src/storage/object/delete.js', {
        '../../../src/storage/utils/collab.js': {
          deleteFromCollab: async (env, daCtx, key) => {
            collabCalls.push(key);
          },
        },
        '../../../src/storage/version/put.js': {
          postObjectVersionWithLabel: async (env, daCtx, label) => {
            assert.strictEqual(label, 'Deleted');
            versionCalls.push(daCtx.key)
          },
        },
      },
    );

    this.timeout(10000);
    await env.DA_CONTENT.put('geometrixx/outdoors/index.html', 'Hello!');
    for (let i = 0; i < 1000; i++) {
      await env.DA_CONTENT.put(`geometrixx/outdoors/${i}/${i}.html`, 'Content');
    }

    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors'  };
    const resp = await deleteObjects(env, daCtx);
    assert.strictEqual(resp.status, 204);
    const list = await env.DA_CONTENT.list({ prefix: 'geometrixx/outdoors' });
    assert.strictEqual(list.objects.length, 0);
    assert.strictEqual(collabCalls.length, 1003); // 1 for each file, 1 for the folder & props
    assert.strictEqual(versionCalls.length, 1001); // 1 for each file, 1 for the folder & props
  });
});
