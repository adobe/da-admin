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
import { ListObjectsV2Command, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

import listObjects from '../../../src/storage/object/list.js';

const CommonPrefixes = [
  { Prefix: 'wknd/mydir/' },
  { Prefix: 'wknd/mydir2/' },
];

const Contents = [
  { Key: 'wknd/index.html' },
  { Key: 'wknd/nav.html' },
  { Key: 'wknd/footer.html' },
];


describe('List Objects', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('ignores folders for metadata', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, CommonPrefixes });
    s3Mock.on(HeadObjectCommand).rejects(new Error('Should Not be called.'));
    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 2);
    assert(data.every((item) => !item.ext));
  });

  it('populates file metadata', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents });

    s3Mock.on(HeadObjectCommand).resolves({ $metadata: { httpStatusCode: 200 }, LastModified: new Date() });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 3);
    assert(data.every((item) => item.ext && item.lastModified));
    assert(s3Mock.commandCalls(HeadObjectCommand, { Bucket: 'adobe-content', Key: 'wknd/index.html' }));
    assert(s3Mock.commandCalls(HeadObjectCommand, { Bucket: 'adobe-content', Key: 'wknd/nav.html' }));
    assert(s3Mock.commandCalls(HeadObjectCommand, { Bucket: 'adobe-content', Key: 'wknd/footer.html' }));
  });

  it('handles a longer list', async () => {

    const prefixes = [...CommonPrefixes];
    for (let i = 0; i < 100; i++) {
      prefixes.push({ Prefix: `wknd/mydir${i}/` });
    }

    const contents = [...Contents];
    for (let i = 0; i < 100; i++) {
      contents.push({ Key: `wknd/file${i}.html` });
    }

    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, CommonPrefixes: prefixes, Contents: contents });

    s3Mock.on(HeadObjectCommand).resolves({ $metadata: { httpStatusCode: 200 }, LastModified: new Date() });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 205);
    assert(s3Mock.commandCalls(HeadObjectCommand).length = 103);
  });
})
