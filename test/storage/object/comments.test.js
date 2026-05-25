/*
 * Copyright 2026 Adobe. All rights reserved.
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

describe('storage/object/comments', () => {
  describe('readCommentsFile', () => {
    it('returns the parsed state and etag on 200', async () => {
      const fakeBody = JSON.stringify({ version: 1, threads: { t1: { id: 't1' } } });
      const fakeResp = {
        Body: { transformToString: async () => fakeBody },
        ETag: '"abc123"',
      };
      function FakeS3Client() {
        this.send = async () => fakeResp;
      }
      const { readCommentsFile } = await esmock('../../../src/storage/object/comments.js', {
        '@aws-sdk/client-s3': {
          S3Client: FakeS3Client,
          GetObjectCommand: function GetObjectCommand() {},
          PutObjectCommand: function PutObjectCommand() {},
        },
      });
      const result = await readCommentsFile({ AEM_BUCKET_NAME: 'b' }, 'org', 'site/.da/comments/d.json');
      assert.deepStrictEqual(result.state, { version: 1, threads: { t1: { id: 't1' } } });
      assert.strictEqual(result.etag, '"abc123"');
    });

    it('returns empty state and null etag on 404', async () => {
      function FakeS3Client() {
        this.send = async () => {
          const err = new Error('not found');
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        };
      }
      const { readCommentsFile } = await esmock('../../../src/storage/object/comments.js', {
        '@aws-sdk/client-s3': {
          S3Client: FakeS3Client,
          GetObjectCommand: function GetObjectCommand() {},
          PutObjectCommand: function PutObjectCommand() {},
        },
      });
      const result = await readCommentsFile({ AEM_BUCKET_NAME: 'b' }, 'org', 'site/.da/comments/d.json');
      assert.deepStrictEqual(result.state, { version: 1, threads: {} });
      assert.strictEqual(result.etag, null);
    });
  });

  describe('atomicMutation', () => {
    function buildFakeClientCtor(impl) {
      return function FakeS3Client() {
        this.send = impl;
        this.middlewareStack = { add: () => {} };
      };
    }

    async function loadModule(FakeS3Client) {
      const fakeClient = new FakeS3Client();
      return esmock('../../../src/storage/object/comments.js', {
        '@aws-sdk/client-s3': {
          S3Client: FakeS3Client,
          GetObjectCommand: function GetObjectCommand() {},
          PutObjectCommand: function PutObjectCommand() {},
        },
        '../../../src/storage/utils/version.js': {
          ifMatch: () => fakeClient,
          ifNoneMatch: () => fakeClient,
        },
      });
    }

    it('runs mutate once on the happy path', async () => {
      let getCount = 0;
      let putCount = 0;
      const FakeS3Client = buildFakeClientCtor(async (cmd) => {
        if (cmd.constructor.name === 'GetObjectCommand') {
          getCount += 1;
          return {
            Body: { transformToString: async () => '{"version":1,"threads":{}}' },
            ETag: `"v${getCount}"`,
          };
        }
        putCount += 1;
        return { ETag: '"newetag"' };
      });
      const { atomicMutation } = await loadModule(FakeS3Client);

      const result = await atomicMutation({ AEM_BUCKET_NAME: 'b' }, 'org', 'k', (state) => {
        // eslint-disable-next-line no-param-reassign
        state.threads.t1 = { id: 't1' };
        return { id: 't1' };
      });
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.result, { id: 't1' });
      assert.strictEqual(getCount, 1);
      assert.strictEqual(putCount, 1);
    });

    it('retries on a 412 conflict and succeeds on second attempt', async () => {
      let getCount = 0;
      let putCount = 0;
      const FakeS3Client = buildFakeClientCtor(async (cmd) => {
        if (cmd.constructor.name === 'GetObjectCommand') {
          getCount += 1;
          return {
            Body: { transformToString: async () => '{"version":1,"threads":{}}' },
            ETag: `"v${getCount}"`,
          };
        }
        putCount += 1;
        if (putCount === 1) {
          const err = new Error('precondition failed');
          err.$metadata = { httpStatusCode: 412 };
          throw err;
        }
        return { ETag: '"newetag"' };
      });
      const { atomicMutation } = await loadModule(FakeS3Client);

      const result = await atomicMutation({ AEM_BUCKET_NAME: 'b' }, 'org', 'k', (state) => {
        // eslint-disable-next-line no-param-reassign
        state.threads.t1 = { id: 't1' };
        return { id: 't1' };
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(getCount, 2);
      assert.strictEqual(putCount, 2);
    });

    it('returns conflict_exhausted after MAX_ATTEMPTS losses', async () => {
      const FakeS3Client = buildFakeClientCtor(async (cmd) => {
        if (cmd.constructor.name === 'GetObjectCommand') {
          return {
            Body: { transformToString: async () => '{"version":1,"threads":{}}' },
            ETag: '"v1"',
          };
        }
        const err = new Error('precondition failed');
        err.$metadata = { httpStatusCode: 412 };
        throw err;
      });
      const { atomicMutation } = await loadModule(FakeS3Client);

      const result = await atomicMutation({ AEM_BUCKET_NAME: 'b' }, 'org', 'k', () => ({}));
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error, 'conflict_exhausted');
      assert.strictEqual(result.status, 409);
    });

    it('short-circuits when mutate returns {error}', async () => {
      let putCount = 0;
      const FakeS3Client = buildFakeClientCtor(async (cmd) => {
        if (cmd.constructor.name === 'GetObjectCommand') {
          return {
            Body: { transformToString: async () => '{"version":1,"threads":{}}' },
            ETag: '"v1"',
          };
        }
        putCount += 1;
        return { ETag: '"newetag"' };
      });
      const { atomicMutation } = await loadModule(FakeS3Client);

      const result = await atomicMutation({ AEM_BUCKET_NAME: 'b' }, 'org', 'k', () => ({ error: 'thread_exists', status: 409 }));
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error, 'thread_exists');
      assert.strictEqual(result.status, 409);
      assert.strictEqual(putCount, 0); // No PUT should happen.
    });
  });
});
