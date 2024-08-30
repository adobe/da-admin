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

import moveHelper from '../../src/helpers/move.js';

describe('Move helper', () => {

  it('handles no form data', async () => {
    const req = {
      formData: async () => undefined,
    };
    const details = await moveHelper(req, {})
    assert.deepStrictEqual(details, {});
  });

  it('handles an error', async () => {
    const req = {
      formData: async () => {
        throw new Error('foo');
      },
    };
    const { error } = await moveHelper(req, {})
    assert.strictEqual(error.status, 400);
  });

  it('handles invalid form data', async () => {
    const req = {
      formData: async () => ({
        get: () => undefined,
      }),
    };
    const { error  } = await moveHelper(req, { key: 'baz' });
    assert.strictEqual(error.status, 400);
  });

  it('handles destination child of source', async () => {
    const req = {
      formData: async () => ({
        get: () => '/foo/baz/bar',
      }),
    };
    const { error } = await moveHelper(req, { key: 'baz' });
    assert.strictEqual(error.status, 400);
  });

  it('prevents collisions', async () => {
    const req = {
      formData: async () => ({
        get: () => '/foo/bar/',
      }),
    };
    const { source, destination } = await moveHelper(req, { key: 'bar' });
    assert.equal(source, 'bar');
    assert(destination.match(/bar-\d+/));
  });

  it('sanitizes a folder path', async () => {
    const req = {
      formData: async () => ({
        get: () => '/foo/bar/',
      }),
    };
    const details = await moveHelper(req, { key: 'baz' });
    assert.deepEqual(details, { source: 'baz', destination: 'bar' });
  });

  it('sanitizes a file path', async () => {
    const req = {
      formData: async () => ({
        get: () => '/FOO/BAR',
      }),
    };
    const details = await moveHelper(req, { key: 'baz' });
    assert.deepEqual(details, { source: 'baz', destination: 'bar' });
  });
});
