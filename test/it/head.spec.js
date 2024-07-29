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

describe('HEAD HTTP Requests', async () => {
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
      const req = new Request('https://admin.da.live/source/wknd/does-not-exist', { method: 'HEAD' });
      const resp = await worker.fetch(req, env);
      assert.strictEqual(resp.status, 404);
    });

    it('returns content for existing object', async () => {
      const req = new Request('https://admin.da.live/source/wknd/index.html', { method: 'HEAD' });
      const resp = await worker.fetch(req, env);
      assert.strictEqual(resp.status, 200);
      const body = await resp.text();
      assert.strictEqual(body, '');
    });
  });
});
