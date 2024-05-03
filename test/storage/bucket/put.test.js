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
import env from '../../utils/mocks/env.js';

import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  CreateBucketCommand,
  BucketAlreadyExists
} from '@aws-sdk/client-s3';

import putBucket from '../../../src/storage/bucket/put.js';


describe('Bucket creation', () => {
  let s3Mock;
  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  })

  it('creates a bucket', async () => {
    const org = 'new-bucket';
    const email = 'test@example.com';
    const daCtx = {
      org,
      users: [{ email }]
    };
    s3Mock
      .on(CreateBucketCommand)
      .callsFake((input) => {
        return { Location: `/${input.Bucket}` }
      });
    const result = await putBucket(env, daCtx);
    // Bucket was created
    assert.strictEqual(result, true, 'Correct response.');
    const calls = s3Mock.commandCalls(CreateBucketCommand, { Bucket: 'new-bucket-content', ACL: 'private' });
    assert.deepStrictEqual(calls.length, 1, 'S3 Called.');

    // Permissions set on Bucket
    const config = env.DA_CONFIG.get(org, { type: 'json' });
    const foundRole = config.data.find((c) => {
      return c.key === 'admin.role.all' && c.value === email;
    });
    assert(foundRole, 'Role set');

    // Org list updated
    const orgs = env.DA_AUTH.get('orgs', { type: 'json' });
    const foundOrg = orgs.find((o) => o.name === org);
    assert(foundOrg, 'Org list updated.');
  });


  it('gracefully handles errors', async () => {
    s3Mock
      .on(CreateBucketCommand)
      .callsFake(() => {
        throw new BucketAlreadyExists();
      });
    const result = await putBucket(env, { org: 'existing' });
    assert.strictEqual(result, false, 'Correct response.');
    const calls = s3Mock.commandCalls(CreateBucketCommand, { Bucket: 'existing-content', ACL: 'private' });
    assert.deepStrictEqual(calls.length, 1, 'S3 Called.');
  })
});
