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

import getObject from '../../../src/storage/object/get.js';

describe('Get Object', () => {

  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });

  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  describe('get requests', () => {
    it('handles non-existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'does-not-exist' };

      const resp = await getObject(env, daCtx);
      assert.strictEqual(resp.status, 404);
    });

    it('handles existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'index.html' };

      const resp = await getObject(env, daCtx);
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.body, 'Hello geometrixx!');
      assert.strictEqual(resp.contentType, 'text/html');
      assert.strictEqual(resp.contentLength, 'Hello geometrixx!'.length);
      assert.deepStrictEqual(resp.metadata, {
        id: '123',
        version: '123',
        users: `[{"email":"user@geometrixx.com"}]`,
        timestamp: '1720723249932',
        path: 'geometrixx/index.html'
      });
      assert(resp.etag.match(/^"[0-9a-f]{32}"$/));
    });
  });

  describe('head requests', () => {
    it('handles non-existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'does-not-exist' };
      const resp = await getObject(env, daCtx, true);
      assert.deepStrictEqual(resp, { status: 404, body: '' });
    });

    it('handles existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'index.html' };

      const resp = await getObject(env, daCtx, true);
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.body, '');
      assert.strictEqual(resp.contentType, 'text/html');
      assert.strictEqual(resp.contentLength, 'Hello geometrixx!'.length);
      assert.deepStrictEqual(resp.metadata, {
        id: '123',
        version: '123',
        users: `[{"email":"user@geometrixx.com"}]`,
        timestamp: '1720723249932',
        path: 'geometrixx/index.html'
      });
      assert(resp.etag.match(/^"[0-9a-f]{32}"$/));
    });
  });
});
