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
import assert from 'assert';

import { describe, it } from 'vitest';

import postHandler from '../../src/handlers/post.js';

describe('Post Route', () => {
  it('Test logout', async () => {
    const deleteCalled = [];
    const DA_AUTH = {
      delete: (key) => deleteCalled.push(key),
    };
    const env = { DA_AUTH };
    const daCtx = {
      path: '/logout',
      users: [ { ident: 'foo@bar.org'}, { ident: 'blah@blah.org' }]
    };

    const resp = await postHandler({ env, daCtx });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(deleteCalled.length, 2);
    assert(deleteCalled.includes('foo@bar.org'));
    assert(deleteCalled.includes('blah@blah.org'));
  });
});
