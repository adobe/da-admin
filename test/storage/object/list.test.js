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

import listObjects, {listObjectsPaginated} from '../../../src/storage/object/list.js';

const Contents = [
  { Key: 'wknd/abc1234.html', LastModified: new Date() },
  { Key: 'wknd/abc123.html', LastModified: new Date() },
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
    assert.strictEqual(data.length, Contents.length);
    assert(data.every((item) => item.ext && item.lastModified));
  });

  it('limits the results', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
      MaxKeys: 2,
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents: [Contents[0], Contents[1]]});

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx, 2);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 2, 'Should only return 2 items');
  });

  it('sorts the results', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);

    const firstIndex = data.findIndex((x) => x.name === 'abc123');
    const secondIndex = data.findIndex((x) => x.name === 'abc1234');
    assert.strictEqual(true,  firstIndex < secondIndex);
  });
});

describe('list paginated objects', async () => {
  it('correctly handles continuation token', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: [Contents[0], Contents[1]],
      NextContinuationToken: 'token'
    });

    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
      ContinuationToken: 'token'
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents: [Contents[2], Contents[3]] });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjectsPaginated({}, daCtx);
    const { data, limit, offset } = JSON.parse(resp.body);
    assert.strictEqual(data.length, 4, 'Should return all items');
    assert.strictEqual(limit, 1000, 'Should use default limit if no limit passed');
    assert.strictEqual(offset, 0, 'Should use default offset if no limit passed');
  });

  it('correctly passes limit and offset', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
      MaxKeys: 27,
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: Contents,
      NextContinuationToken: 'token',
    });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjectsPaginated({}, daCtx, 2, 1);
    const { data, limit, offset } = JSON.parse(resp.body);
    assert.strictEqual(data.length, 2, 'Should return 2 items');
    assert.strictEqual(data[1].name, 'index', 'Should return correct items');
    assert.strictEqual(limit, 2, 'Should use default limit if no limit passed');
    assert.strictEqual(offset, 1, 'Should use default offset if no limit passed');
  });

  it('fetches more until enough files are present', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
      MaxKeys: 29,
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: new Array(29).fill({ Key: '.ignored', LastModified: new Date() }),
      NextContinuationToken: 'token',
    });

    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
      MaxKeys: 29,
      ContinuationToken: 'token',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: Contents,
      NextContinuationToken: 'token',
    });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjectsPaginated({}, daCtx, 4, 0);
    const { data } = JSON.parse(resp.body);
    assert.strictEqual(data.length, 4, 'Should return 4 items');
  });

  it('doesn\'t sort the results', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'adobe-content',
      Prefix: 'wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents });

    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp = await listObjectsPaginated({}, daCtx);
    const data = JSON.parse(resp.body).data;

    const firstIndex = data.findIndex((x) => x.name === 'abc1234');
    const secondIndex = data.findIndex((x) => x.name === 'abc123');
    assert.strictEqual(true,  firstIndex < secondIndex);
  });

  it('enforces size limit', async () => {
    const daCtx = { org: 'adobe', key: 'wknd' };
    const resp1 = await listObjectsPaginated({}, daCtx, 5001, 0);
    assert.strictEqual(resp1.status, 400);
    const resp2 = await listObjectsPaginated({}, daCtx, 500, 4501);
    assert.strictEqual(resp2.status, 400);
  });
});
