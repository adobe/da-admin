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
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import listObjects from '../../../src/storage/object/list.js';

const s3Mock = mockClient(S3Client);

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
      Bucket: 'bkt',
      Prefix: 'adobe/wknd/',
      Delimiter: '/',
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents });

    const daCtx = { bucket: 'bkt', org: 'adobe', key: 'wknd' };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 3);
    assert(data.every((item) => item.ext && item.lastModified));
  });

  it('limits the results', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'rt-bkt',
      Prefix: 'acme/wknd/',
      Delimiter: '/',
      MaxKeys: 2,
    }).resolves({ $metadata: { httpStatusCode: 200 }, Contents: [Contents[0], Contents[1]] });

    const daCtx = { bucket: 'rt-bkt', org: 'acme', key: 'wknd' };
    const resp = await listObjects({}, daCtx, 2);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 2, 'Should only return 2 items');
  });

  it('passes continuation token and returns next token', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'rt-bkt',
      Prefix: 'acme/wknd/',
      Delimiter: '/',
      ContinuationToken: 'prev-token',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: [Contents[0]],
      IsTruncated: true,
      NextContinuationToken: 'next-token',
    });

    const daCtx = {
      bucket: 'rt-bkt',
      org: 'acme',
      key: 'wknd',
      continuationToken: 'prev-token',
    };
    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.strictEqual(data.length, 1, 'Should only return 1 item');
    assert.strictEqual(resp.continuationToken, 'next-token');
  });

  it('does not return continuation token on terminal page', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'rt-bkt',
      Prefix: 'acme/wknd/',
      Delimiter: '/',
      ContinuationToken: 'prev-token',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: [Contents[1]],
      IsTruncated: false,
      NextContinuationToken: 'should-not-be-returned',
    });

    const daCtx = {
      bucket: 'rt-bkt',
      org: 'acme',
      key: 'wknd',
      continuationToken: 'prev-token',
    };
    const resp = await listObjects({}, daCtx);
    assert.strictEqual(resp.continuationToken, undefined);
  });

  it('filters out entries the user cannot reach when restrictToPermitted is set', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'bkt',
      Prefix: 'adobe/',
      Delimiter: '/',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      CommonPrefixes: [{ Prefix: 'adobe/folder2/' }, { Prefix: 'adobe/folder3/' }],
      Contents: [{ Key: 'adobe/index.html', LastModified: new Date() }],
    });

    // The user is only granted read on a page deep inside folder2 - not on
    // folder2 itself, not on folder3, and not on the root index.html.
    const pathLookup = new Map([
      ['deep@bloggs.org', [{ group: 'deep@bloggs.org', path: '/folder2/a/b/c', actions: ['read'] }]],
    ]);
    const daCtx = {
      bucket: 'bkt',
      org: 'adobe',
      key: '',
      users: [{ email: 'deep@bloggs.org' }],
      aclCtx: { pathLookup },
    };

    const resp = await listObjects({}, daCtx, undefined, true);
    const data = JSON.parse(resp.body);
    assert.deepStrictEqual(data.map((item) => item.name), ['folder2']);
  });

  it('does not filter entries when restrictToPermitted is not set (default, backward compatible)', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'bkt',
      Prefix: 'adobe/',
      Delimiter: '/',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      CommonPrefixes: [{ Prefix: 'adobe/folder2/' }, { Prefix: 'adobe/folder3/' }],
      Contents: [{ Key: 'adobe/index.html', LastModified: new Date() }],
    });

    // Same restrictive ACL as above, but the caller did not ask for filtering
    // (e.g. because the exact-path permission check already passed).
    const pathLookup = new Map([
      ['deep@bloggs.org', [{ group: 'deep@bloggs.org', path: '/folder2/a/b/c', actions: ['read'] }]],
    ]);
    const daCtx = {
      bucket: 'bkt',
      org: 'adobe',
      key: '',
      users: [{ email: 'deep@bloggs.org' }],
      aclCtx: { pathLookup },
    };

    const resp = await listObjects({}, daCtx);
    const data = JSON.parse(resp.body);
    assert.deepStrictEqual(data.map((item) => item.name).sort(), ['folder2', 'folder3', 'index'].sort());
  });

  it('does not return same continuation token again', async () => {
    s3Mock.on(ListObjectsV2Command, {
      Bucket: 'rt-bkt',
      Prefix: 'acme/wknd/',
      Delimiter: '/',
      ContinuationToken: 'prev-token',
    }).resolves({
      $metadata: { httpStatusCode: 200 },
      Contents: [Contents[2]],
      IsTruncated: true,
      NextContinuationToken: 'prev-token',
    });

    const daCtx = {
      bucket: 'rt-bkt',
      org: 'acme',
      key: 'wknd',
      continuationToken: 'prev-token',
    };
    const resp = await listObjects({}, daCtx);
    assert.strictEqual(resp.continuationToken, undefined);
  });
});
