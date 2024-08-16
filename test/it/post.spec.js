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

describe('POST/PUT HTTP Requests', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });
  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  for (const method of ['POST', 'PUT']) {
    describe(method, () => {
      describe('/source', () => {
        it('saves a file', async () => {
          const body = new FormData();
          body.append('data', 'Hello, World!');
          const opts =  {
            body,
            method
          };
          const req = new Request('https://admin.da.live/source/wknd/test.txt', opts);
          const resp = await worker.fetch(req, env);
          assert.strictEqual(resp.status, 201);
          const head = await env.DA_CONTENT.head('wknd/test.txt');
          assert(head);
        });

        it('creates versions of file', async () => {
          const body = new FormData();
          body.append('data', 'Hello, World!');
          const opts =  {
            body,
            method
          };
          const req = new Request('https://admin.da.live/source/wknd/index.html', opts);
          const resp = await worker.fetch(req, env);
          assert.strictEqual(resp.status, 201);
          const head = await env.DA_CONTENT.head('wknd/index.html');
          assert(head);
          const { customMetadata } = head;
          const input = { prefix: `wknd/.da-versions/${customMetadata.id}`}
          const r2o = await env.DA_CONTENT.list(input);
          assert.strictEqual(r2o.objects.length, 1);
        });
      });
    });
  }
});
