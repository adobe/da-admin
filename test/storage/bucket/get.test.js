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

import env from '../../utils/mocks/env.js';

const buckets = [
  { name: 'test-org', created: new Date() },
  { name: 'another-org', created: new Date() },
  { name: 'yet-another-org', created: new Date() },
]
const resp = {
  body: JSON.stringify(buckets),
  status: 200,
  contentType: 'application/json',
}

const getBucket = await esmock(
  '../../../src/storage/bucket/get.js', {
    '../../../src/storage/bucket/list.js': { default: async () => resp },
  }
);

describe('get buckets', () => {
  it('returns found bucket', async() => {
    const result = await getBucket(env, { org: 'test-org'});
    assert.deepStrictEqual(result.name, 'test-org', 'Found bucket.');
  });

  it('returns not found bucket', async() => {
    const result = await getBucket(env, { org: 'does-not-exist'});
    assert.ifError(result);
  })
});
