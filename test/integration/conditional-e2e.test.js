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
import esmock from 'esmock';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

describe('Conditional Headers End-to-End', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    handler = await esmock(
      '../../src/index.js',
      {
        '../../src/utils/daCtx.js': {
          default: async (req) => ({
            path: '/source/org/site/test.html',
            api: 'source',
            bucket: 'test-bucket',
            org: 'org',
            site: 'site',
            key: 'site/test.html',
            ext: 'html',
            users: [{ email: 'test@example.com' }],
            authorized: true,
            conditionalHeaders: {
              ifMatch: req.headers?.get('if-match') || null,
              ifNoneMatch: req.headers?.get('if-none-match') || null,
            },
            aclCtx: {
              actionSet: new Set(['read', 'write']),
              pathLookup: new Map(),
            },
            method: req.method,
          }),
        },
        '../../src/storage/utils/object.js': {
          invalidateCollab: async () => {},
        },
      },
    );
  });

  it('GET with If-None-Match returns 304 with ETag header in response', async () => {
    const etag = '"test-etag-123"';
    s3Mock
      .on(GetObjectCommand)
      .rejects({ $metadata: { httpStatusCode: 304 }, ETag: etag });

    const req = {
      method: 'GET',
      url: 'http://localhost:8787/source/org/site/test.html',
      headers: {
        get: (name) => {
          if (name === 'if-none-match') return etag;
          return null;
        },
      },
    };

    const env = { AEM_BUCKET_NAME: 'test-bucket' };
    const resp = await handler.default.fetch(req, env);

    assert.strictEqual(resp.status, 304);
    assert.strictEqual(resp.headers.get('ETag'), etag);
    assert.strictEqual(resp.headers.get('Access-Control-Expose-Headers').includes('ETag'), true);
  });

  it('PUT returns ETag header in response', async () => {
    const newEtag = '"created-etag-456"';
    s3Mock
      .on(GetObjectCommand)
      .resolves({ $metadata: { httpStatusCode: 404 } })
      .on(PutObjectCommand)
      .resolves({ $metadata: { httpStatusCode: 200 }, ETag: newEtag });

    const formData = new FormData();
    formData.append('data', new File(['<p>content</p>'], 'test.html', { type: 'text/html' }));

    const req = {
      method: 'PUT',
      url: 'http://localhost:8787/source/org/site/test.html',
      headers: {
        get: (name) => {
          if (name === 'content-type') return 'multipart/form-data';
          if (name === 'x-da-initiator') return 'test';
          return null;
        },
      },
      formData: async () => formData,
    };

    const env = {
      AEM_BUCKET_NAME: 'test-bucket',
      dacollab: {
        fetch: async () => ({ status: 200 }),
      },
    };
    const resp = await handler.default.fetch(req, env);

    assert.strictEqual(resp.status, 201);
    assert.strictEqual(resp.headers.get('ETag'), newEtag);
  });

  it('PUT with If-None-Match:* on existing returns 412 with proper headers', async () => {
    const existingEtag = '"existing-etag"';
    s3Mock
      .on(GetObjectCommand)
      .resolves({
        Body: Buffer.from('<p>existing</p>'),
        ContentType: 'text/html',
        ContentLength: 15,
        ETag: existingEtag,
        Metadata: { id: 'doc123' },
        $metadata: { httpStatusCode: 200 },
      });

    const formData = new FormData();
    formData.append('data', new File(['<p>new</p>'], 'test.html', { type: 'text/html' }));

    const req = {
      method: 'PUT',
      url: 'http://localhost:8787/source/org/site/test.html',
      headers: {
        get: (name) => {
          if (name === 'content-type') return 'multipart/form-data';
          if (name === 'if-none-match') return '*';
          return null;
        },
      },
      formData: async () => formData,
    };

    const env = { AEM_BUCKET_NAME: 'test-bucket' };
    const resp = await handler.default.fetch(req, env);

    assert.strictEqual(resp.status, 412);
    // Should have CORS headers even for error responses
    assert.strictEqual(resp.headers.get('Access-Control-Allow-Origin'), '*');
  });
});
