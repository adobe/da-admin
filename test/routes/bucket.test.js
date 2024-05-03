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

import { strict as assert } from 'node:assert';
import { strict as esmock } from 'esmock';

import env from '../utils/mocks/env.js';

describe('bucket route', () => {
  describe('get', () => {
    it('handles found bucket', async () => {
      const bucket = { name: 'Found', created: new Date() };
      const { getBucket } = await esmock(
        '../../src/routes/bucket.js', {
          '../../src/storage/bucket/get.js': {
            default: async () => bucket
          },
        }
      );
      const resp = await getBucket({ env, daCtx: {} })
      assert.strictEqual(resp.body, JSON.stringify(bucket), 'Body correct');
      assert.strictEqual(resp.status, 200, 'Status correct.');
    });

    it('handles not found bucket', async () => {
      const { getBucket } = await esmock(
        '../../src/routes/bucket.js', {
          '../../src/storage/bucket/get.js': {
            default: async () => undefined
          },
        }
      );
      const resp = await getBucket({ env, daCtx: {} })
      assert.ifError(resp.body);
      assert.strictEqual(resp.status, 404, 'Status correct.');
    });
  });

  describe('put', () => {
    it('handles anonymous user', async () => {
      const { postBucket } = await esmock('../../src/routes/bucket.js');
      const daCtx = {
        org: 'org',
        users: [{ email: 'anonymous' }],
      }

      const resp = await postBucket({ env, daCtx });
      assert.ifError(resp.body);
      assert.strictEqual(resp.status, 401, 'Status correct.');
    });

    it('handles bucket creation error', async () => {
      const daCtx = {
        org: 'test-org',
        users: [{ email: 'test@example.com' }],
      }
      const { postBucket } = await esmock(
        '../../src/routes/bucket.js', {
          '../../src/storage/bucket/put.js': {
            default: async () => false
          },
        });
      const resp = await postBucket({ env, daCtx, });
      assert.deepStrictEqual(resp, { status: 500 }, 'Response correct.');
    });
    it('handles bucket creation error', async () => {
      const daCtx = {
        org: 'test-org',
        users: [{ email: 'test@example.com' }],
      }
      const { postBucket } = await esmock(
        '../../src/routes/bucket.js', {
          '../../src/storage/bucket/put.js': {
            default: async () => true
          },
        });
      const resp = await postBucket({ env, daCtx, });
      assert.deepStrictEqual(resp, { status: 201 }, 'Response correct.');
    })
  });
});
