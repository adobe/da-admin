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
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import esmock from 'esmock';

const s3Mock = mockClient(S3Client);

import getObject from '../../../src/storage/object/get.js';

const ORG = 'adobe';
const KEY = 'wknd/index.html';
const BUCKET = `root-bucket`;

const S3_KEY = `${ORG}/${KEY}`;

describe('Get Object', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('gets object (head = false)', async () => {
    const Body = Buffer.from('<p>hello world</p>');
    const ContentType = 'text/html';
    const ContentLength = Body.length;
    const LastModified = new Date().toISOString
    const Metadata = { foo: 'bar' };
    const ETag = 'etag123';
    s3Mock
      .on(GetObjectCommand, {
        Bucket: BUCKET,
        Key: S3_KEY,
      })
      .resolves({
        Body,
        ContentType,
        ContentLength,
        Metadata,
        LastModified,
        ETag,
        $metadata: { httpStatusCode: 200 },
      });
    const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false);
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.contentType, ContentType);
    assert.strictEqual(resp.contentLength, ContentLength);
    assert.deepStrictEqual(resp.metadata, { ...Metadata, LastModified });
    assert.strictEqual(resp.etag, ETag);
    assert.deepStrictEqual(resp.body, Body);
  });

  it('gets object head (head = true)', async () => {
    const fakeUrl = 'https://example.com/head';
    let called = false;
    // esmock for getSignedUrl and fetch
    const getObjectWithMocks = await esmock(
      '../../../src/storage/object/get.js',
      {
        '@aws-sdk/s3-request-presigner': {
          getSignedUrl: async () => fakeUrl,
        },
      }
    );

    const savedFetch = globalThis.fetch;
    const lastModified = new Date().toISOString();
    try {
      globalThis.fetch = async (url, opts) => {
        called = true;
        assert.strictEqual(url, fakeUrl);
        assert.strictEqual(opts.method, 'HEAD');
        return {
          status: 200,
          headers: {
            get: (name) => {
              if (name === 'content-type') return 'text/html';
              if (name === 'content-length') return '123';
              if (name === 'etag') return 'etag456';
              if (name === 'last-modified') return lastModified;
              return null;
            },
            forEach: (cb) => {
              cb('bar', 'x-amz-meta-foo');
            },
          },
        };
      };

      const resp = await getObjectWithMocks({}, { bucket: BUCKET, org: ORG, key: KEY }, true);
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.contentType, 'text/html');
      assert.strictEqual(resp.contentLength, '123');
      assert.deepStrictEqual(resp.metadata, { foo: 'bar', LastModified: lastModified });
      assert.strictEqual(resp.etag, 'etag456');
      assert.strictEqual(resp.body, '');
      assert(called, 'fetch should be called');
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('returns 404 when object not found (head = false)', async () => {
    const error = new Error('Not found');
    error.$metadata = { httpStatusCode: 404 };
    s3Mock.on(GetObjectCommand, {
      Bucket: BUCKET,
      Key: S3_KEY,
    }).rejects(error);
    // Import getObject directly for head=false (no esmock needed)
    const getObject = (await import('../../../src/storage/object/get.js')).default;
    const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false);
    assert.strictEqual(resp.status, 404);
    assert.strictEqual(resp.body, '');
    assert.strictEqual(resp.contentLength, 0);
  });
});
