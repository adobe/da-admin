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
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

import listObjects from '../../../src/storage/object/list.js';

const Contents = [
  { Key: 'wknd/index.html', LastModified: new Date() },
  { Key: 'wknd/nav.html', LastModified: new Date() },
  { Key: 'wknd/footer.html', LastModified: new Date() },
];


describe('List Objects', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('populates file metadata', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 3);
    assert(data.every((item) => item.ext && item.lastModified));
  });
})
