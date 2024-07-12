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
import esmock from 'esmock';
import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

const s3Mock = mockClient(S3Client);
const url = 'http://localhost:8787/geometrixx-content/index.html';

describe('Get Object', () => {

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

  describe('get requests', () => {
    it('handles non-existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'does-not-exist' };
      const getObject = (await import('../../../src/storage/object/get.js')).default;

      const resp = await getObject(env, daCtx);
      assert.strictEqual(resp.status, 404);
    });

    it('handles existing object', async () => {

      const resp = {
        Body: 'Hello geometrixx!',
        $metadata: { httpStatusCode: 200 },
        ContentType: 'text/html',
        ContentLength: '123',
        Metadata: { id: 'foo', version: '123' },
        ETag: '123',
      };
      s3Mock
        .on(GetObjectCommand, { Key: 'index.html', Bucket: 'geometrixx-content' })
        .resolves(resp);

      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'index.html' };
      const getObject = (await import('../../../src/storage/object/get.js')).default;

      const data = await getObject(env, daCtx);
      assert.deepStrictEqual(data, {
        body: 'Hello geometrixx!',
        status: 200,
        contentType: 'text/html',
        contentLength: '123',
        metadata: { id: 'foo', version: '123' },
        etag: '123',
      });
    });
  });

  describe('head requests', () => {
    it('handles non-existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'does-not-exist' };
      const fetch = async (target, opts) => {
        assert.strictEqual(target, url);
        assert.strictEqual(opts.method, 'HEAD');
        return { status: 404, headers: new Map() };
      }
      const getObject = await esmock('../../../src/storage/object/get.js', {
        '@aws-sdk/s3-request-presigner': {
          getSignedUrl: async (client, cmd, opts) => {
            assert(client instanceof S3Client);
            assert(cmd instanceof HeadObjectCommand);
            assert(opts.expiresIn);
            return url;
          },
        },
        import: { fetch }
      });

      const resp = await getObject(env, daCtx, true);
      assert.strictEqual(resp.status, 404);
    });

    it('handles existing object', async () => {
      const daCtx = { users: [{ email: 'aparker@geometrixx.info' }], org: 'geometrixx', key: 'index.html' };
      const fetch = async (target, opts) => {
        assert.strictEqual(target, url);
        assert.strictEqual(opts.method, 'HEAD');
        return {
          status: 200,
          headers: new Map([
            ['content-type', 'text/html'],
            ['content-length', '123'],
            ['etag', '123'],
            ['x-amz-meta-id', 'foo'],
            ['x-amz-meta-version', '123'],
          ]),
        };
      }
      const getObject = await esmock('../../../src/storage/object/get.js', {
        '@aws-sdk/s3-request-presigner': {
          getSignedUrl: async (client, cmd, opts) => {
            assert(client instanceof S3Client);
            assert(cmd instanceof HeadObjectCommand);
            assert(opts.expiresIn);
            return url;
          },
        },
        import: { fetch }
      });

      const resp = await getObject(env, daCtx, true);
      assert.deepStrictEqual(resp, {
        body: '',
        status: 200,
        contentType: 'text/html',
        contentLength: '123',
        metadata: { id: 'foo', version: '123' },
        etag: '123',
      });
    });
  });
});
