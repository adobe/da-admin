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
import esmock from 'esmock';

describe('DELETE Handler', () => {
  it('dispatches /comments to deleteComments', async () => {
    const calls = [];
    const deleteHandler = (await esmock('../../src/handlers/delete.js', {
      '../../src/routes/comments.js': {
        deleteComments: async (args) => {
          calls.push(args);
          return { status: 204 };
        },
      },
      '../../src/routes/source.js': { deleteSource: async () => ({ status: 200 }) },
    })).default;

    const resp = await deleteHandler({
      req: {},
      env: {},
      daCtx: { path: '/comments/myorg/mysite/docid123/threads/t1' },
    });
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(calls.length, 1);
  });

  it('dispatches /source to deleteSource', async () => {
    const calls = [];
    const deleteHandler = (await esmock('../../src/handlers/delete.js', {
      '../../src/routes/source.js': {
        deleteSource: async (args) => {
          calls.push(args);
          return { status: 204 };
        },
      },
      '../../src/routes/comments.js': { deleteComments: async () => ({ status: 200 }) },
    })).default;

    const resp = await deleteHandler({
      req: {},
      env: {},
      daCtx: { path: '/source/myorg/myfile.html' },
    });
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(calls.length, 1);
  });
});
