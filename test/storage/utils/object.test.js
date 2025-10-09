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

/* eslint-env mocha */
import assert from 'assert';
import { invalidateCollab } from '../../../src/storage/utils/object.js';

describe('Storage Object Utils tests', () => {
  function setupEnv() {
    const called = [];
    const env = { DA_COLLAB: 'https://localhost' };
    return { called, env };
  }

  it('Should invalidate', async () => {
    const { called, env } = setupEnv();

    const savedFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        console.log(`invalidate called with ${url}`);
        called.push(url);
      };

      assert.strictEqual(called.length, 0, 'precondition');
      await invalidateCollab('syncAdmin', 'https://admin.da.live/source/a/b/c.html', env);
      assert.strictEqual(called.length, 1);
      assert.strictEqual(called[0], 'https://localhost/api/v1/syncAdmin?doc=https://admin.da.live/source/a/b/c.html');
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Should not invalidate non-html documents', async () => {
    const { called, env } = setupEnv();

    const savedFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        called.push(url);
      };

      assert.strictEqual(called.length, 0, 'precondition');
      await invalidateCollab('syncAdmin', 'https://admin.da.live/source/a/b/c.jpg', env);
      await invalidateCollab('syncAdmin', 'https://admin.da.live/source/a/b/c/d', env);
      assert.strictEqual(called.length, 0, 'should not have invalidated anything');
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
