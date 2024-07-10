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
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import listObjects from '../../../src/storage/object/list.js';

import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

const s3Mock = mockClient(S3Client);

describe('list objects', () => {
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

  it('handles errors', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: '' };

    s3Mock
      .on(ListObjectsV2Command, { Bucket: 'geometrixx-content', Prefix: null, Delimiter: '/' })
      .rejects(new Error('NoSuchBucket: The specified bucket does not exist.'));
    const resp = await listObjects(env, daCtx);
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.body, '');
  });


  it('lists bucket contents (e.g. Sites)', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: '' };

    const s3resp = {
      Contents: [
        { Key: 'shapes.props', LastModified: new Date(), ETag: '1234', Size: 1234 },
        { Key: 'we-retail.props', LastModified: new Date(), ETag: '1234', Size: 1234 },
      ],
      CommonPrefixes: [
        { Prefix: 'shapes/' },
        { Prefix: 'we-retail/' },
        { Prefix: 'outdoors/' },
      ],
      $metadata: { httpStatusCode: 200 },
      ContentType: 'application/json',
    };

    s3Mock
      .on(ListObjectsV2Command, { Bucket: 'geometrixx-content', Prefix: null, Delimiter: '/' })
      .resolves(s3resp);
    const resp = await listObjects(env, daCtx);
    assert.strictEqual(resp.status, 200);
    const data = JSON.parse(resp.body);
    assert.deepStrictEqual(data[0], { name: 'outdoors', path: '/geometrixx/outdoors' })
    assert.deepStrictEqual(data[1], { name: 'shapes', path: '/geometrixx/shapes' });
    assert.deepStrictEqual(data[2], { name: 'we-retail', path: '/geometrixx/we-retail' });
  });

  it('lists site content (e.g pages/folders/etc)', async () => {
    const daCtx = { users: [{email: 'aparker@geometrixx.info'}], org: 'geometrixx', key: 'outdoors' };

    const s3resp = {
      Contents: [
        { Key: 'outdoors/index.html', LastModified: new Date(), ETag: '1234', Size: 1234 },
        { Key: 'outdoors/logo.jpg', LastModified: new Date(), ETag: '1234', Size: 1234 },
        { Key: 'outdoors/hero.jpg', LastModified: new Date(), ETag: '1234', Size: 1234 },
      ],
      CommonPrefixes: [
        { Prefix: 'outdoors/coats/' },
        { Prefix: 'outdoors/pants/' },
        { Prefix: 'outdoors/hats/' },
      ],
      $metadata: { httpStatusCode: 200 },
      ContentType: 'application/json',
    };
    s3Mock
      .on(ListObjectsV2Command, { Bucket: 'geometrixx-content', Prefix: 'outdoors/', Delimiter: '/' })
      .resolves(s3resp);
    const resp = await listObjects(env, daCtx);
    assert.strictEqual(resp.status, 200);
    const data = JSON.parse(resp.body);
    assert.deepStrictEqual(data[0], { name: 'coats', path: '/geometrixx/outdoors/coats' })
    assert.deepStrictEqual(data[1], { name: 'hats', path: '/geometrixx/outdoors/hats' });
    assert.deepStrictEqual(data[2], { name: 'hero', ext: 'jpg', path: '/geometrixx/outdoors/hero.jpg' });
    assert.deepStrictEqual(data[3], { name: 'index', ext: 'html', path: '/geometrixx/outdoors/index.html' });
    assert.deepStrictEqual(data[4], { name: 'logo', ext: 'jpg', path: '/geometrixx/outdoors/logo.jpg' });
    assert.deepStrictEqual(data[5], { name: 'pants', path: '/geometrixx/outdoors/pants' });
  });
});
