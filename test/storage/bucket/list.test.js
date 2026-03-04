/*
 * Copyright 2025 Adobe. All rights reserved.
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
import listBuckets from '../../../src/storage/bucket/list.js';

describe('List', () => {
  const aclCtx = {
    pathLookup: new Map(),
  };
  const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], aclCtx };

  /* This test has to be rewritten
  describe('Lists authed buckets', async () => {
    const bucketsResp = await listBuckets(env, daCtx);
    const buckets = JSON.parse(bucketsResp.body);

    it('Only authed and anon buckets are listed', () => {
      assert.strictEqual(buckets.length, 2);
    });
  });
  */

  describe('404s on any error', () => {
    it('Dies on null env', async () => {
      const bucketsResp = await listBuckets(null, daCtx);
      assert.strictEqual(bucketsResp.status, 404);
    });
  });
});
