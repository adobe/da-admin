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
import esmock from 'esmock';
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

      const collabcalls = [];
      const dacollab = {
        fetch: (url) => {
          collabcalls.push(url);
        }
      }
      const env = { dacollab };
      const ctx = {
        org: 'foo',
        key: 'mydir',
        origin: 'somehost.sometld',
        users: [{ email: 'haha@foo.com' }],
      };
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };
      await copyObject(env, ctx, details, false);

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

      assert.strictEqual(1, collabcalls.length);
      assert.deepStrictEqual(collabcalls,
        ['https://localhost/api/v1/syncAdmin?doc=somehost.sometld/source/foo/mydir/newdir/xyz.html']);
    });

    it('Copies a file for rename', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/dir1/myfile.html' }] });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake((input => {
        s3Sent.push(input);
      }));

      const collabcalls = [];
      const dacollab = {
        fetch: (url) => {
          collabcalls.push(url);
        }
      }
      const env = { dacollab };
      const ctx = { org: 'testorg', key: 'mydir/dir1', origin: 'http://localhost:3000' };
      const details = {
        source: 'mydir/dir1',
        destination: 'mydir/dir2',
      };
      await copyObject(env, ctx, details, true);


      assert.strictEqual(s3Sent.length, 3);
      const input = s3Sent[2];
      assert.strictEqual(input.Bucket, 'testorg-content');
      assert.strictEqual(input.CopySource, 'testorg-content/mydir/dir1/myfile.html');
      assert.strictEqual(input.Key, 'mydir/dir2/myfile.html');
      assert.ifError(input.Metadata);

      assert.deepStrictEqual(collabcalls,
        ['https://localhost/api/v1/syncAdmin?doc=http://localhost:3000/source/testorg/mydir/dir2/myfile.html']);
    });

    it('Adds copy condition', async () => {
      const msAdded = [];
      const mockS3Client = class {
        send(command) {
          return command;
        }
        middlewareStack = {
          add: (a, b) => {
            msAdded.push(a);
            msAdded.push(b);
          },
        };
      };

      const { copyFile } = await esmock(
        '../../../src/storage/object/copy.js', {
          '@aws-sdk/client-s3': {
            S3Client: mockS3Client
          },
        }
      )

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = {
        org: 'myorg',
        origin: 'https://blahblah:7890',
        users: ['joe@bloggs.org'],
      };
      const details = {
        source: 'mysrc',
        destination: 'mydst',
      };
      const resp = await copyFile({}, env, daCtx, 'mysrc/abc/def.html', details, false);

      assert.strictEqual(resp.constructor.name, 'CopyObjectCommand');
      assert.strictEqual(resp.input.Bucket, 'myorg-content');
      assert.strictEqual(resp.input.Key, 'mydst/abc/def.html');
      assert.strictEqual(resp.input.CopySource, 'myorg-content/mysrc/abc/def.html');
      assert.strictEqual(resp.input.MetadataDirective, 'REPLACE');
      assert.strictEqual(resp.input.Metadata.Path, 'mydst/abc/def.html');
      assert.strictEqual(resp.input.Metadata.Users, '["joe@bloggs.org"]');
      const mdts = Number(resp.input.Metadata.Timestamp);
      assert(mdts + 1000 > Date.now(), 'Should not be longer than a second ago');

      assert.strictEqual(msAdded.length, 2);
      const amd = msAdded[1];
      assert.strictEqual(amd.step, 'build');
      assert.strictEqual(amd.name, 'ifNoneMatchMiddleware');
      assert.deepStrictEqual(amd.tags, ['METADATA', 'IF-NONE-MATCH']);
      const func = msAdded[0];

      const nxtCalled = [];
      const nxt = (args) => {
        nxtCalled.push(args);
        return 'yay!';
      };
      const res = await func((nxt));

      const args = { request: { foo: 'bar', headers: { aaa: 'bbb' } } };
      const res2 = await res(args);
      assert.strictEqual(res2, 'yay!');

      assert.strictEqual(nxtCalled.length, 1);
      assert.strictEqual(nxtCalled[0].request.foo, 'bar');
      assert.deepStrictEqual(nxtCalled[0].request.headers,
        { aaa: 'bbb', 'cf-copy-destination-if-none-match': '*' });

      assert.deepStrictEqual(collabCalled,
        ['https://localhost/api/v1/syncAdmin?doc=https://blahblah:7890/source/myorg/mydst/abc/def.html']);
    });

    it('Copy content when destination already exists', async () => {
      const error = {
        $metadata: { httpStatusCode: 412 },
      };

      const mockS3Client = class {
        send() {
          throw error;
        }
        middlewareStack = { add: () => {} };
      };
      const mockGetObject = async (e, u, h) => {
        return {
          body: 'original body',
          contentLength: 42,
          contentType: 'text/html',
        }
      };
      const puwv = []
      const mockPutObjectWithVersion = async (e, c, u) => {
        puwv.push({e, c, u});
        return 'beuaaark!';
      };

      const { copyFile } = await esmock(
        '../../../src/storage/object/copy.js', {
          '../../../src/storage/object/get.js': {
            default: mockGetObject,
          },
          '../../../src/storage/version/put.js': {
            putObjectWithVersion: mockPutObjectWithVersion,
          },
          '@aws-sdk/client-s3': {
            S3Client: mockS3Client,
          },
        },
      );

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = { org: 'xorg' };
      const details = {
        source: 'xsrc',
        destination: 'xdst',
      };
      const resp = await copyFile({}, env, daCtx, 'xsrc/abc/def.html', details, false);
      assert.strictEqual(resp, 'beuaaark!');

      assert.strictEqual(puwv.length, 1);
      assert.strictEqual(puwv[0].c, daCtx);
      assert.strictEqual(puwv[0].e, env);
      assert.strictEqual(puwv[0].u.body, 'original body');
      assert.strictEqual(puwv[0].u.contentLength, 42);
      assert.strictEqual(puwv[0].u.key, 'xdst/abc/def.html');
      assert.strictEqual(puwv[0].u.org, 'xorg');
      assert.strictEqual(puwv[0].u.type, 'text/html');
    });

    it('Copy content when origin does not exists', async () => {
      const error = {
        $metadata: { httpStatusCode: 404, hi: 'ha' },
      };

      const mockS3Client = class {
        send() {
          throw error;
        }
        middlewareStack = { add: () => {} };
      };

      const { copyFile } = await esmock(
        '../../../src/storage/object/copy.js', {
          '@aws-sdk/client-s3': {
            S3Client: mockS3Client,
          },
        },
      );

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = { org: 'qqqorg', origin: 'http://qqq' };
      const details = {
        source: 'qqqsrc',
        destination: 'qqqdst',
      };
      const resp = await copyFile({}, env, daCtx, 'qqqsrc/abc/def.html', details, false);
      assert.strictEqual(resp.$metadata, error.$metadata);
      assert.deepStrictEqual(collabCalled,
        ['https://localhost/api/v1/syncAdmin?doc=http://qqq/source/qqqorg/qqqdst/abc/def.html']);
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

      const env = { dacollab: { fetch: () => {} } };
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
        },
        dacollab: { fetch: () => {} }
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
        },
        dacollab: { fetch: () => {} }
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
        },
        dacollab: { fetch: () => {} }
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
