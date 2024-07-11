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

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import getObject from '../../../src/storage/object/get.js';

import { getMiniflare, destroyMiniflare } from '../../mocks/miniflare.js';

const s3Mock = mockClient(S3Client);

describe('get object', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
    s3Mock.reset();
  });
  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  it ('handles errors', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'does-not.exist' };

    const input = { Bucket: 'geometrixx-content', Key: 'does-not.exist' };
    s3Mock
      .on(GetObjectCommand, input)
      .rejects(new Error('NoSuchBucket: The specified bucket does not exist.'));
    const resp = await getObject(env, daCtx);
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.body, '');
    const calls = s3Mock.commandCalls(GetObjectCommand, input);
    assert(calls[0]);
  });

  it ('gets object', async () => {

  });

  it ('heads object', async () => {

  });
});
