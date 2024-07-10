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
import esmock from 'esmock';

describe('list route', () => {
  describe( 'list buckets', () => {
    const orgs = [
      { name: 'test-org', created: new Date() },
      { name: 'another-org', created: new Date() },
      { name: 'yet-another-org', created: new Date() },
    ]
    it('lists buckets all buckets', async () => {
      const getList = await esmock(
        '../../src/routes/list.js',
        {
          '../../src/storage/org/list.js': {
            default: async () => orgs
          },
        }
      );
      const resp = await getList({ env: {}, daCtx: {} })
      assert.strictEqual(resp.body, JSON.stringify(orgs), 'Correct response.');
      assert.strictEqual(resp.status, 200, 'Correct status.');
    })
  });

  it('returns 404 for no buckets', async () => {
    const getList = await esmock(
      '../../src/routes/list.js',
      {
        '../../src/storage/org/list.js': {
          default: async () => []
        },
      }
    );

    const resp = await getList({ env: {}, daCtx: {} })
    assert.strictEqual(resp.body, '', 'Correct response.');
    assert.strictEqual(resp.status, 404, 'Correct status.');
  });

  describe('list objects', () => {
    // Handle previous API response structure (i.e. Pass through)
    const objects = [
      { path: '/org/folder', name: 'folder' },
      { path: '/org/another', name: 'another-folder' },
      { path: '/org/page', name: 'page', ext: 'html' },
      { path: '/org/sheet', name: 'sheet', ext: 'json' }
    ];

    it('lists objects in a bucket', async () => {
      const getList = await esmock(
        '../../src/routes/list.js',
        {
          '../../src/storage/object/list.js': {
            default: async () => {
              return { body: JSON.stringify(objects), status: 200, contentType: 'application/json' }
            }
          },
        }
      );
      const resp = await getList({ env: {}, daCtx: { org: 'org' }});
      assert.deepStrictEqual(JSON.parse(resp.body), objects, 'Body correct.');
      assert.strictEqual(resp.status, 200, 'Status correct.');
    })
  });
});
