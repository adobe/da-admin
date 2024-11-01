/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import assert from 'node:assert';
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import copyObject from '../../../src/storage/object/copy.js';

const s3Mock = mockClient(S3Client);

describe('Object copy', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('does not allow copying to the same location', async () => {
    const ctx = {
      org: 'foo',
      key: 'mydir',
      users: [{ email: 'haha@foo.com' }],
    };

    const details = {
      source: 'mydir',
      destination: 'mydir',
    };
    const resp = await copyObject({}, ctx, details, false);
    assert.strictEqual(resp.status, 409);
  });

  describe('single file context', () => {
    it('Copies a file', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/xyz.html' }] });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));

      const ctx = {
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };
      await copyObject({}, ctx, details, false);

      assert.strictEqual(s3Sent.length, 3);
      const input = s3Sent[2];
      assert.strictEqual(input.Bucket, 'foo-content');
      assert.strictEqual(input.CopySource, 'foo-content/mydir/xyz.html');
      assert.strictEqual(input.Key, 'mydir/newdir/xyz.html');

      const md = input.Metadata;
      assert(md.ID, "ID should be set");
      assert(md.Version, "Version should be set");
      assert.strictEqual(typeof (md.Timestamp), 'string', 'Timestamp should be set as a string');
      assert.strictEqual(md.Users, '[{"email":"haha@foo.com"}]');
      assert.strictEqual(md.Path, 'mydir/newdir/xyz.html');
    });

    it('Copies a file for rename', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/dir1/myfile.html' }] });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));

      const ctx = { key: 'mydir/dir1', org: 'testorg' };
      const details = {
        source: 'mydir/dir1',
        destination: 'mydir/dir2',
      };
      await copyObject({}, ctx, details, true);


      assert.strictEqual(s3Sent.length, 3);
      const input = s3Sent[2];
      assert.strictEqual(input.Bucket, 'testorg-content');
      assert.strictEqual(input.CopySource, 'testorg-content/mydir/dir1/myfile.html');
      assert.strictEqual(input.Key, 'mydir/dir2/myfile.html');
      assert.ifError(input.Metadata);
    });
  });

  describe('Copies a list of files', async () => {
    it('handles no continuation token', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: 'mydir/xyz.html' }],
      });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));

      const ctx = {
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };
      const resp = await copyObject({}, ctx, details, false);
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(resp.body, undefined);
      assert.strictEqual(s3Sent.length, 3);
    });

    it('handles a list with continuation token', async () => {
      const DA_JOBS = {};
      const env = {
        DA_JOBS: {
          put(key, value) {
            DA_JOBS[key] = value;
          }
        }
      }
      s3Mock.on(ListObjectsV2Command)
        .resolves({
          Contents: [{ Key: 'mydir/xyz.html' }],
          NextContinuationToken: 'token',
        });

      s3Mock.on(ListObjectsV2Command, { ContinuationToken: 'token' })
        .resolves({
          Contents: [{ Key: 'mydir/abc.html' }],
        });


      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));

      const ctx = {
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };
      const resp = await copyObject(env, ctx, details, false);
      assert.strictEqual(resp.status, 206);
      const { continuationToken } = JSON.parse(resp.body);

      assert.deepStrictEqual(JSON.parse(DA_JOBS[continuationToken]), ['mydir/abc.html']);
      assert.strictEqual(s3Sent.length, 3);
    });

    it('handles a continuation token w/ more', async () => {
      const continuationToken = 'copy-mydir-mydir/newdir-uuid';
      const remaining = [];
      for (let i = 0; i < 900; i++) {
        remaining.push(`mydir/file${i}.html`);
      }
      remaining.push('mydir/abc.html');

      const DA_JOBS = {};
      DA_JOBS[continuationToken] = remaining;
      const env = {
        DA_JOBS: {
          put(key, value) {
            DA_JOBS[key] = value;
          },
          get(key) {
            return DA_JOBS[key];
          }
        }
      }

      const ctx = {
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
        continuationToken,
      };
      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));


      const resp = await copyObject(env, ctx, details, false);
      assert.strictEqual(resp.status, 206);
      assert.deepStrictEqual(JSON.parse(resp.body), { continuationToken });
      assert.strictEqual(s3Sent.length, 900);
      assert.deepStrictEqual(JSON.parse(DA_JOBS[continuationToken]), ['mydir/abc.html']);
    });

    it('handles continuation token w/o more', async () => {
      const continuationToken = 'copy-mydir-mydir/newdir-uuid';
      const remaining = ['mydir/abc.html'];

      const DA_JOBS = {};
      DA_JOBS[continuationToken] = remaining;
      const env = {
        DA_JOBS: {
          get(key) {
            return DA_JOBS[key];
          },
          delete(key) {
            delete DA_JOBS[key];
          }
        }
      }

      const ctx = {
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
        continuationToken,
      };
      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));
      const resp = await copyObject(env, ctx, details, false);
      assert.strictEqual(resp.status, 204);
      assert.ifError(resp.body);
      assert.strictEqual(s3Sent.length, 1);
      assert.ifError(DA_JOBS[continuationToken]);
    });
  });
});
