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
import assert from 'node:assert'
import { destroyMiniflare, getMiniflare } from '../mocks/miniflare.js';
import worker from '../../src/index.js';

describe('DELETE HTTP Requests',  () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });
  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  describe ('/source', async () => {
    it('handles non-existing file', async () => {
      const req = new Request('https://admin.da.live/source/wknd/does-not-exist', { method: 'DELETE' });
      const resp = await worker.fetch(req, env);
      assert.strictEqual(resp.status, 204);
    });

    it('handles existing file', async () => {
      const before = await env.DA_CONTENT.get('wknd/index.html');
      const id = before.customMetadata.id;
      const input = {
        prefix: `wknd/.da-versions/${id}/`,
        delimiter: '/',
      }
      let list = await env.DA_CONTENT.list(input);
      assert.strictEqual(list.objects.length, 0);

      const req = new Request('https://admin.da.live/source/wknd/index.html', { method: 'DELETE' });
      const resp = await worker.fetch(req, env);
      assert.strictEqual(resp.status, 204);
      const after = await env.DA_CONTENT.get('wknd/index.html');
      assert.ifError(after);
      list = await env.DA_CONTENT.list(input);
      assert.strictEqual(list.objects.length, 1);
    });
  });
})
