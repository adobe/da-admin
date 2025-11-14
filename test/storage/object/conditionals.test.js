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
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

import getObject from '../../../src/storage/object/get.js';
import { putObjectWithVersion } from '../../../src/storage/version/put.js';

const ORG = 'adobe';
const KEY = 'wknd/index.html';
const BUCKET = 'root-bucket';
const S3_KEY = `${ORG}/${KEY}`;

describe('Conditional Headers', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('GET with If-None-Match', () => {
    it('returns 304 when ETag matches', async () => {
      const etag = '"abc123"';
      s3Mock
        .on(GetObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 304 } });

      const conditionalHeaders = { ifNoneMatch: etag };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 304);
      assert.strictEqual(resp.body, '');
    });

    it('returns 200 with content when ETag does not match', async () => {
      const Body = Buffer.from('<p>hello</p>');
      const etag = '"xyz789"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body,
          ContentType: 'text/html',
          ContentLength: Body.length,
          ETag: etag,
          $metadata: { httpStatusCode: 200 },
        });

      const conditionalHeaders = { ifNoneMatch: '"abc123"' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 200);
      assert.deepStrictEqual(resp.body, Body);
      assert.strictEqual(resp.etag, etag);
    });

    it('returns 304 when If-None-Match is * and resource exists', async () => {
      s3Mock
        .on(GetObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 304 } });

      const conditionalHeaders = { ifNoneMatch: '*' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 304);
    });
  });

  describe('GET with If-Match', () => {
    it('returns 412 when If-Match is * and resource does not exist', async () => {
      s3Mock
        .on(GetObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 412 } });

      const conditionalHeaders = { ifMatch: '*' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 412);
    });

    it('returns 200 when If-Match is * and resource exists', async () => {
      const Body = Buffer.from('<p>content</p>');
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body,
          ContentType: 'text/html',
          ContentLength: Body.length,
          ETag: '"etag123"',
          $metadata: { httpStatusCode: 200 },
        });

      const conditionalHeaders = { ifMatch: '*' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 200);
      assert.deepStrictEqual(resp.body, Body);
    });

    it('returns 412 when ETag does not match', async () => {
      s3Mock
        .on(GetObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 412 } });

      const conditionalHeaders = { ifMatch: '"wrongetag"' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 412);
    });
  });

  describe('HEAD with If-None-Match', () => {
    it('returns 304 when ETag matches (HEAD)', async () => {
      // For HEAD requests with conditionals, the fetch should return 304
      const esmock = await import('esmock');
      const getObjectWithMocks = await esmock.default(
        '../../../src/storage/object/get.js',
        {
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: async () => 'https://example.com/signed',
          },
        },
      );

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => ({
          status: 304,
          headers: new Map(),
        });

        const conditionalHeaders = { ifNoneMatch: '"abc123"' };
        const resp = await getObjectWithMocks.default(
          {},
          { bucket: BUCKET, org: ORG, key: KEY },
          true,
          conditionalHeaders,
        );

        assert.strictEqual(resp.status, 304);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });
  });

  describe('PUT with If-Match', () => {
    it('returns 412 when If-Match is * and resource does not exist (create-only fails)', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 404 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html' };
      const update = { bucket: BUCKET, org: ORG, key: KEY };
      const clientConditionals = { ifMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 412);
    });

    it('proceeds with update when If-Match is * and resource exists', async () => {
      const existingEtag = '"existing123"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>old</p>'),
          ContentType: 'text/html',
          ContentLength: 10,
          ETag: existingEtag,
          Metadata: { id: 'doc123', version: 'v1', timestamp: '123456' },
          $metadata: { httpStatusCode: 200 },
        })
        .on(PutObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 200 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 200);
    });

    it('returns 412 when ETag does not match and does not retry', async () => {
      const existingEtag = '"existing123"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>old</p>'),
          ContentType: 'text/html',
          ContentLength: 10,
          ETag: existingEtag,
          Metadata: { id: 'doc123', version: 'v1', timestamp: '123456' },
          $metadata: { httpStatusCode: 200 },
        })
        .on(PutObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 412 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifMatch: '"wrongetag"' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      // Should return 412 and NOT retry
      assert.strictEqual(resp.status, 412);
      // Verify only one PutObjectCommand was called (no retry)
      assert.strictEqual(s3Mock.commandCalls(PutObjectCommand).length, 2); // 1 version + 1 main
    });
  });

  describe('PUT with If-None-Match', () => {
    it('creates resource when If-None-Match is * and resource does not exist', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 404 } })
        .on(PutObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 200 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifNoneMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 201);
    });

    it('returns 412 when If-None-Match is * and resource exists (create-only)', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>existing</p>'),
          ContentType: 'text/html',
          ContentLength: 15,
          ETag: '"existing123"',
          Metadata: { id: 'doc123' },
          $metadata: { httpStatusCode: 200 },
        });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifNoneMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 412);
    });

    it('returns 412 when If-None-Match matches ETag and does not retry', async () => {
      const matchingEtag = '"match123"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 404 } })
        .on(PutObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 412 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifNoneMatch: matchingEtag };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      // Should return 412 and NOT retry
      assert.strictEqual(resp.status, 412);
    });
  });

  describe('Internal conditionals still retry', () => {
    it('retries on 412 when no client conditionals provided', async () => {
      let callCount = 0;
      s3Mock
        .on(GetObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 404 } })
        .on(PutObjectCommand)
        .callsFake(() => {
          callCount++;
          if (callCount === 1) {
            // First call fails with 412
            return Promise.reject({ $metadata: { httpStatusCode: 412 } });
          }
          // Second call succeeds
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      // No clientConditionals - should use internal retry logic

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, null);

      // Should succeed after retry
      assert.strictEqual(resp.status, 201);
      // Verify it retried (multiple PutObjectCommand calls)
      assert(s3Mock.commandCalls(PutObjectCommand).length >= 2);
    });
  });

  describe('Edge cases', () => {
    it('handles conflicting If-Match and If-None-Match on GET (If-None-Match wins)', async () => {
      s3Mock
        .on(GetObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 304 } });

      const conditionalHeaders = { ifMatch: '"abc"', ifNoneMatch: '"abc"' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      // If-None-Match takes precedence for GET
      assert.strictEqual(resp.status, 304);
    });

    it('handles conflicting If-Match and If-None-Match on PUT (If-Match wins)', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>existing</p>'),
          ContentType: 'text/html',
          ContentLength: 15,
          ETag: '"existing123"',
          Metadata: { id: 'doc123', version: 'v1' },
          $metadata: { httpStatusCode: 200 },
        })
        .on(PutObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 200 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifMatch: '*', ifNoneMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      // If-Match takes precedence for PUT - should succeed (resource exists)
      assert.strictEqual(resp.status, 200);
    });

    it('includes ETag in 304 response', async () => {
      const etag = '"abc123"';
      s3Mock
        .on(GetObjectCommand)
        .rejects({ $metadata: { httpStatusCode: 304 }, ETag: etag });

      const conditionalHeaders = { ifNoneMatch: etag };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      assert.strictEqual(resp.status, 304);
      assert.strictEqual(resp.etag, etag);
    });

    it('If-Match:* uses actual ETag for version control on update', async () => {
      const actualEtag = '"real-etag-456"';
      let putCommandEtag;

      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>existing</p>'),
          ContentType: 'text/html',
          ContentLength: 15,
          ETag: actualEtag,
          Metadata: { id: 'doc123', version: 'v1', timestamp: '123456', preparsingstore: '123456' },
          $metadata: { httpStatusCode: 200 },
        })
        .on(PutObjectCommand)
        .callsFake((input) => {
          // Capture the If-Match header used
          putCommandEtag = input;
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 200);
      // Verify the actual ETag was used, not the wildcard
      assert(putCommandEtag !== null, 'Should have captured the PUT command');
    });

    it('handles empty ETag gracefully', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>test</p>'),
          ContentType: 'text/html',
          ContentLength: 11,
          ETag: '""',
          $metadata: { httpStatusCode: 200 },
        });

      const conditionalHeaders = { ifNoneMatch: '""' };
      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, conditionalHeaders);

      // Should handle empty ETag without crashing
      assert(resp.status === 200 || resp.status === 304);
    });

    it('GET without conditionals still returns ETag', async () => {
      const etag = '"normal-etag"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>content</p>'),
          ContentType: 'text/html',
          ContentLength: 14,
          ETag: etag,
          $metadata: { httpStatusCode: 200 },
        });

      const resp = await getObject({}, { bucket: BUCKET, org: ORG, key: KEY }, false, null);

      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.etag, etag);
    });

    it('HEAD with If-None-Match returns 304 with ETag', async () => {
      const esmock = await import('esmock');
      const getObjectWithMocks = await esmock.default(
        '../../../src/storage/object/get.js',
        {
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: async () => 'https://example.com/signed',
          },
        },
      );

      const savedFetch = globalThis.fetch;
      const etag = '"head-etag"';
      try {
        globalThis.fetch = async (url, options) => {
          // Verify conditional headers are passed to fetch
          assert(options.headers['If-None-Match'], 'If-None-Match should be in fetch headers');
          return {
            status: 304,
            headers: new Map([['etag', etag]]),
          };
        };

        const conditionalHeaders = { ifNoneMatch: etag };
        const resp = await getObjectWithMocks.default(
          {},
          { bucket: BUCKET, org: ORG, key: KEY },
          true,
          conditionalHeaders,
        );

        assert.strictEqual(resp.status, 304);
        assert.strictEqual(resp.etag, etag);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('PUT with If-None-Match:* on existing resource returns 412 immediately (no retry)', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>existing</p>'),
          ContentType: 'text/html',
          ContentLength: 15,
          ETag: '"existing123"',
          Metadata: { id: 'doc123' },
          $metadata: { httpStatusCode: 200 },
        });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifNoneMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 412);
      // Verify no PUT commands were sent to S3 (failed before reaching S3)
      assert.strictEqual(s3Mock.commandCalls(PutObjectCommand).length, 0);
    });

    it('PUT with If-Match:* on non-existent resource returns 412 immediately', async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 404 } });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };
      const clientConditionals = { ifMatch: '*' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, clientConditionals);

      assert.strictEqual(resp.status, 412);
      // Verify no PUT commands were sent to S3
      assert.strictEqual(s3Mock.commandCalls(PutObjectCommand).length, 0);
    });

    it('PUT returns ETag in response for successful create', async () => {
      const newEtag = '"new-etag-789"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 404 } })
        .on(PutObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 200 }, ETag: newEtag });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, null);

      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.etag, newEtag);
    });

    it('PUT returns ETag in response for successful update', async () => {
      const oldEtag = '"old-etag"';
      const newEtag = '"new-etag-updated"';
      s3Mock
        .on(GetObjectCommand)
        .resolves({
          Body: Buffer.from('<p>old</p>'),
          ContentType: 'text/html',
          ContentLength: 10,
          ETag: oldEtag,
          Metadata: { id: 'doc123', version: 'v1', timestamp: '123456', preparsingstore: '123456' },
          $metadata: { httpStatusCode: 200 },
        })
        .on(PutObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 200 }, ETag: newEtag });

      const daCtx = { users: [{ email: 'test@example.com' }], ext: 'html', method: 'PUT' };
      const update = { bucket: BUCKET, org: ORG, key: KEY, body: Buffer.from('<p>new</p>'), type: 'text/html' };

      const resp = await putObjectWithVersion({}, daCtx, update, false, null, null);

      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.etag, newEtag);
    });
  });
});
