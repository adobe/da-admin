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
import { destroyMiniflare, getMiniflare } from '../mocks/miniflare.js';
import worker from '../../src/index.js';
import { SignJWT } from 'jose';

describe('GET HTTP Requests', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });
  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  describe('/source', () => {
    it('returns 404 for non-existing object', async () => {
      const req = new Request('https://admin.da.live/source/wknd/does-not-exist');
      const resp = await worker.fetch(req, env);
      assert.strictEqual(resp.status, 404);
    });

    it('returns content for existing object', async () => {
      const req = new Request('https://admin.da.live/source/wknd/index.html');
      const resp = await worker.fetch(req, env);
      assert.strictEqual(resp.status, 200);
      const body = await resp.text();
      assert.strictEqual(body, 'Hello wknd!');
    });
  });

  describe('/list', () => {
    describe('orgs', () => {
      it('lists orgs for anonymous user', async () => {
        const req = new Request('https://admin.da.live/list');
        const resp = await worker.fetch(req, env);
        assert.strictEqual(resp.status, 200);
        const body = await resp.json();
        assert.strictEqual(body.length, 1);
        assert.strictEqual(body[0].name, 'wknd');
      });

      it('lists orgs for authenticated user', async () => {
        const secret = new TextEncoder().encode('secret');
        const mockPayload = { user_id: 'aparker@geometrixx.info', created_at: Date.now(), expires_in: 300000 };
        const jws = await new SignJWT(mockPayload)
          .setProtectedHeader({ alg: 'HS256' })
          .sign(secret);

        const req = new Request('https://admin.da.live/list', { headers: { 'Authorization': `Bearer ${jws}` } });
        const resp = await worker.fetch(req, env);
        assert.strictEqual(resp.status, 200);
        const body = await resp.json();
        assert.strictEqual(body.length, 2);
        assert(body.some((item) => item.name === 'wknd'));
        assert(body.some((item) => item.name === 'geometrixx'));
      });
    });

    describe('objects', async () => {
      it('lists no content', async () => {
        const req = new Request('https://admin.da.live/list/does-not-exist');
        const resp = await worker.fetch(req, env);
        assert.strictEqual(resp.status, 200);
        const body = await resp.json();
        assert.strictEqual(body.length, 0);
        assert.deepStrictEqual(body, []);
      });

      it('lists content', async () => {
        const req = new Request('https://admin.da.live/list/wknd');
        const resp = await worker.fetch(req, env);
        assert.strictEqual(resp.status, 200);
        const body = await resp.json();
        assert.strictEqual(body.length, 1);
        assert(/^\d+$/.test(body[0].lastModified));
        delete body[0].lastModified;
        assert.deepStrictEqual(body[0], { name: 'index', ext: 'html', path: '/wknd/index.html' });
      });
    })
  });
});
