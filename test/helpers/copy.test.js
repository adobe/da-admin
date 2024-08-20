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

import copyHelper from '../../src/helpers/copy.js';

describe('Copy helper', () => {
  it('handles no form data', async () => {
    const req = {
      formData: async () => undefined,
    };
    const details = await copyHelper(req, {})
    assert.deepStrictEqual(details, {});
  });

  it('sanitizes a folder path', async () => {
    const req = {
      formData: async () => ({
        get: () => '/foo/bar/',
      }),
    };
    const details = await copyHelper(req, { key: 'baz' });
    assert.deepEqual(details, { source: 'baz', destination: 'bar' });
  });

  it('sanitizes a file path', async () => {
    const req = {
      formData: async () => ({
        get: () => '/FOO/BAR',
      }),
    };
    const details = await copyHelper(req, { key: 'baz' });
    assert.deepEqual(details, { source: 'baz', destination: 'bar' });
  });
});
