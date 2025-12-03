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
/* eslint-disable no-unused-vars,consistent-return,max-classes-per-file */
import assert from 'node:assert';
import esmock from 'esmock';
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import copyObject, { copyFile } from '../../../src/storage/object/copy.js';
import { getAclCtx } from '../../../src/utils/auth.js';

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

  it('returns 403 when copying to a location without write permission', async () => {
    const pathLookup = new Map();
    pathLookup.set('aaa@bbb.ccc', [
      { path: '/source/mysrc', actions: ['read'] },
      { path: '/source/mydst', actions: ['read'] },
    ]);

    const aclCtx = { pathLookup, actionSet: new Set(['read']) };
    const ctx = { aclCtx, key: 'source/mysrc', users: [{ email: 'aaa@bbb.ccc' }] };

    const details = {
      source: 'mysrc',
      destination: 'mydst',
    };

    // eslint-disable-next-line no-shadow
    const { copyFile } = await import('../../../src/storage/object/copy.js');
    const resp = await copyFile({}, {}, ctx, '/source/mysrc', details, false);
    assert.strictEqual(resp.$metadata.httpStatusCode, 403);
  });

  it('Copy to location without read permission', async () => {
    const pathLookup = new Map();
    pathLookup.set('foo@bar.com', [
      { path: '/source/mysrc', actions: [] },
      { path: '/source/mydst', actions: ['read', 'write'] },
    ]);
    const aclCtx = { pathLookup };
    const users = [{ email: 'foo@bar.com' }];
    const ctx = { aclCtx, users, key: '/foo' };

    const resp = await copyFile({}, {}, ctx, 'source/mysrc', { source: 'mysrc', destination: 'mydst' }, false);
    assert.strictEqual(resp.$metadata.httpStatusCode, 403);
  });

  it('Copy to location without write permission', async () => {
    const pathLookup = new Map();
    pathLookup.set('foo@bar.com', [
      { path: '/source/mysrc', actions: ['read'] },
      { path: '/source/mydst', actions: ['read'] },
    ]);
    const aclCtx = { pathLookup };
    const users = [{ email: 'foo@bar.com' }];
    const ctx = { aclCtx, users, key: '/foo' };

    const resp = await copyFile({}, {}, ctx, 'source/mysrc', { source: 'mysrc', destination: 'mydst' }, false);
    assert.strictEqual(resp.$metadata.httpStatusCode, 403);
  });

  it('Copy to location with permission', async () => {
    const pathLookup = new Map();
    pathLookup.set('aaa@bbb.ccc', [
      { path: '/source/mysrc', actions: ['read'] },
      { path: '/source/mydst', actions: ['read', 'write'] },
    ]);

    const aclCtx = { pathLookup, actionSet: new Set(['read']) };
    const ctx = {
      aclCtx, bucket: 'root-bucket', key: 'source/mysrc', org: 'org', users: [{ email: 'aaa@bbb.ccc' }],
    };

    const details = {
      source: 'mysrc',
      destination: 'mydst',
    };

    const mockS3Client = class {
      // eslint-disable-next-line class-methods-use-this
      send(command) {
        return {
          command,
          $metadata: { httpStatusCode: 200 },
        };
      }

      middlewareStack = {
        add: (a, b) => {},
      };
    };

    const mockGetObject = async (env, { bucket, org, key }, head) => {
      if (bucket === 'root-bucket'
        && org === 'org'
        && key === 'source/mysrc') {
        return {
          contentType: 'text/html',
        };
      }
    };

    // eslint-disable-next-line no-shadow
    const { copyFile } = await esmock('../../../src/storage/object/copy.js', {
      '@aws-sdk/client-s3': {
        S3Client: mockS3Client,
      },
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
    });

    const resp = await copyFile({}, {}, ctx, 'source/mysrc', details, true);
    assert.strictEqual(resp.$metadata.httpStatusCode, 200);
    const { input } = resp.command;
    assert.strictEqual(input.Bucket, 'root-bucket');
    assert.strictEqual(input.CopySource, 'root-bucket/org/source/mysrc');
    assert.strictEqual(input.Key, 'org/source/mydst');
    assert.strictEqual(input.ContentType, 'text/html');
    assert(input.MetadataDirective === undefined);
  });

  describe('single file context', () => {
    it('Copies a file', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/xyz.html' }] });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake(((input) => {
        s3Sent.push(input);
      }));

      // Mock getObject to return content type for HEAD requests
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'foo') {
          if (key === 'mydir/xyz.html') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          } else if (key === 'mydir' || key === 'mydir.props') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          }
        }
        return null;
      };

      const collabcalls = [];
      const dacollab = {
        fetch: (url) => {
          collabcalls.push(url);
        },
      };
      const env = { dacollab };
      const ctx = {
        bucket: 'root-bucket',
        env,
        org: 'foo',
        key: 'mydir',
        origin: 'somehost.sometld',
        users: [{ email: 'haha@foo.com' }],
      };
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };

      const copyObjectWithMock = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      await copyObjectWithMock.default(env, ctx, details, false);

      assert.strictEqual(s3Sent.length, 3);

      // Make the order in s3Sent predictable
      s3Sent.sort((a, b) => a.Key.localeCompare(b.Key));

      const input = s3Sent[2];
      assert.strictEqual(input.Bucket, 'root-bucket');
      assert.strictEqual(input.CopySource, 'root-bucket/foo/mydir/xyz.html');
      assert.strictEqual(input.Key, 'foo/mydir/newdir/xyz.html');
      assert.strictEqual(input.ContentType, 'text/html');

      const md = input.Metadata;
      assert(md.ID, 'ID should be set');
      assert(md.Version, 'Version should be set');
      assert.strictEqual(typeof (md.Timestamp), 'string', 'Timestamp should be set as a string');
      assert.strictEqual(md.Users, '[{"email":"haha@foo.com"}]');
      assert.strictEqual(md.Path, 'mydir/newdir/xyz.html');

      assert.strictEqual(1, collabcalls.length);
      assert.deepStrictEqual(
        collabcalls,
        ['https://localhost/api/v1/syncadmin?doc=somehost.sometld/source/foo/mydir/newdir/xyz.html'],
      );
    });

    it('Copies a file for rename', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/dir1/myfile.html' }] });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake(((input) => {
        s3Sent.push(input);
      }));

      // Mock getObject to return content type for HEAD requests
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'testorg') {
          if (key === 'mydir/dir1/myfile.html') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          } else if (key === 'mydir/dir1' || key === 'mydir/dir1.props') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          }
        }
        return null;
      };

      const collabcalls = [];
      const dacollab = {
        fetch: (url) => {
          collabcalls.push(url);
        },
      };
      const env = { dacollab };
      const ctx = {
        bucket: 'root-bucket', org: 'testorg', key: 'mydir/dir1', origin: 'http://localhost:3000',
      };
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir/dir1',
        destination: 'mydir/dir2',
      };

      const copyObjectWithMock = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      await copyObjectWithMock.default(env, ctx, details, true);

      assert.strictEqual(s3Sent.length, 3);

      // Make the order in s3Sent predictable
      s3Sent.sort((a, b) => a.Key.localeCompare(b.Key));

      const input = s3Sent[2];
      assert.strictEqual(input.Bucket, 'root-bucket');
      assert.strictEqual(input.CopySource, 'root-bucket/testorg/mydir/dir1/myfile.html');
      assert.strictEqual(input.Key, 'testorg/mydir/dir2/myfile.html');
      assert.strictEqual(input.ContentType, 'text/html');
      assert.ifError(input.Metadata);

      assert.deepStrictEqual(
        collabcalls,
        ['https://localhost/api/v1/syncadmin?doc=http://localhost:3000/source/testorg/mydir/dir2/myfile.html'],
      );
    });

    it('Adds copy condition', async () => {
      const msAdded = [];
      const mockS3Client = class {
        // eslint-disable-next-line class-methods-use-this
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

      // Mock getObject to return content type for HEAD requests
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'myorg' && key === 'mysrc/abc/def.html') {
          return {
            contentType: 'text/html',
            status: 200,
          };
        }
        return null;
      };

      // eslint-disable-next-line no-shadow
      const { copyFile } = await esmock('../../../src/storage/object/copy.js', {
        '@aws-sdk/client-s3': {
          S3Client: mockS3Client,
        },
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = {
        bucket: 'root-bucket',
        org: 'myorg',
        origin: 'https://blahblah:7890',
        users: [{ email: 'joe@bloggs.org', otherstuff: 'blah' }],
      };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'mysrc',
        destination: 'mydst',
      };
      const resp = await copyFile({}, env, daCtx, 'mysrc/abc/def.html', details, false);

      assert.strictEqual(resp.constructor.name, 'CopyObjectCommand');
      assert.strictEqual(resp.input.Bucket, 'root-bucket');
      assert.strictEqual(resp.input.Key, 'myorg/mydst/abc/def.html');
      assert.strictEqual(resp.input.CopySource, 'root-bucket/myorg/mysrc/abc/def.html');
      assert.strictEqual(resp.input.ContentType, 'text/html');
      assert.strictEqual(resp.input.MetadataDirective, 'REPLACE');
      assert.strictEqual(resp.input.Metadata.Path, 'mydst/abc/def.html');
      assert.strictEqual(resp.input.Metadata.Users, '[{"email":"joe@bloggs.org"}]');
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
      assert.deepStrictEqual(
        nxtCalled[0].request.headers,
        { aaa: 'bbb', 'cf-copy-destination-if-none-match': '*' },
      );

      assert.deepStrictEqual(
        collabCalled,
        ['https://localhost/api/v1/syncadmin?doc=https://blahblah:7890/source/myorg/mydst/abc/def.html'],
      );
    });

    it('Skips copying when source does not exist (folder without object)', async () => {
      const mockS3Client = class {
        middlewareStack = {
          add: () => {},
        };
      };

      // Mock getObject to return 404 for a folder that doesn't exist as an object
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'myorg' && key === 'mysrc/virtual-folder') {
          return {
            status: 404,
          };
        }
        return null;
      };

      // eslint-disable-next-line no-shadow
      const { copyFile } = await esmock('../../../src/storage/object/copy.js', {
        '@aws-sdk/client-s3': {
          S3Client: mockS3Client,
        },
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const env = {
        dacollab: {
          fetch: () => {},
        },
      };
      const daCtx = {
        bucket: 'root-bucket',
        org: 'myorg',
        origin: 'https://test.com',
        users: [{ email: 'test@example.com' }],
      };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'mysrc',
        destination: 'mydst',
      };

      const resp = await copyFile({}, env, daCtx, 'mysrc/virtual-folder', details, false);
      assert.strictEqual(resp.$metadata.httpStatusCode, 404);
    });

    it('Copies files with special characters in names', async () => {
      const mockS3Client = class {
        // eslint-disable-next-line class-methods-use-this
        send(command) {
          return command;
        }

        middlewareStack = {
          add: () => {},
        };
      };

      // Mock getObject to return content type for HEAD requests
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'myorg') {
          if (key === 'mysrc/icon=gift-box, style=two-toned.svg'
            || key === 'mysrc/boost saver_img1.jpg'
            || key === 'mysrc/file%20with%20encoded.png') {
            return {
              contentType: 'image/svg+xml',
              status: 200,
            };
          }
        }
        return null;
      };

      // eslint-disable-next-line no-shadow
      const { copyFile } = await esmock('../../../src/storage/object/copy.js', {
        '@aws-sdk/client-s3': {
          S3Client: mockS3Client,
        },
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const env = {
        dacollab: {
          fetch: () => {},
        },
      };
      const daCtx = {
        bucket: 'root-bucket',
        org: 'myorg',
        origin: 'https://test.com',
        users: [{ email: 'test@example.com' }],
      };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'mysrc',
        destination: 'mydst',
      };

      // Test file with commas, equals signs, and spaces
      const resp1 = await copyFile({}, env, daCtx, 'mysrc/icon=gift-box, style=two-toned.svg', details, false);
      assert.strictEqual(resp1.constructor.name, 'CopyObjectCommand');
      assert.strictEqual(resp1.input.CopySource, 'root-bucket/myorg/mysrc/icon=gift-box,%20style=two-toned.svg');
      assert.strictEqual(resp1.input.Key, 'myorg/mydst/icon=gift-box, style=two-toned.svg');

      // Test file with spaces
      const resp2 = await copyFile({}, env, daCtx, 'mysrc/boost saver_img1.jpg', details, false);
      assert.strictEqual(resp2.constructor.name, 'CopyObjectCommand');
      assert.strictEqual(resp2.input.CopySource, 'root-bucket/myorg/mysrc/boost%20saver_img1.jpg');
      assert.strictEqual(resp2.input.Key, 'myorg/mydst/boost saver_img1.jpg');

      // Test file with already-encoded characters
      const resp3 = await copyFile({}, env, daCtx, 'mysrc/file%20with%20encoded.png', details, false);
      assert.strictEqual(resp3.constructor.name, 'CopyObjectCommand');
      // The %20 should be double-encoded to %2520
      assert.strictEqual(resp3.input.CopySource, 'root-bucket/myorg/mysrc/file%2520with%2520encoded.png');
      assert.strictEqual(resp3.input.Key, 'myorg/mydst/file%20with%20encoded.png');
    });

    it('Copy content when destination already exists', async () => {
      const error = {
        $metadata: { httpStatusCode: 412 },
      };

      const mockS3Client = class {
        // eslint-disable-next-line class-methods-use-this
        send() {
          throw error;
        }

        middlewareStack = { add: () => {} };
      };
      const mockGetObject = async (e, u, h) => {
        if (u.bucket === 'mybucket'
          && u.org === 'xorg'
          && u.key === 'xsrc/abc/def.html') {
          return {
            body: 'original body',
            contentLength: 42,
            contentType: 'text/html',
          };
        }
      };
      const puwv = [];
      const mockPutObjectWithVersion = async (e, c, u) => {
        puwv.push({ e, c, u });
        return 'beuaaark!';
      };

      // eslint-disable-next-line no-shadow
      const { copyFile } = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/version/put.js': {
          putObjectWithVersion: mockPutObjectWithVersion,
        },
        '@aws-sdk/client-s3': {
          S3Client: mockS3Client,
        },
      });

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = { bucket: 'mybucket', org: 'xorg' };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'xsrc',
        destination: 'xdst',
      };
      const resp = await copyFile({}, env, daCtx, 'xsrc/abc/def.html', details, false);
      assert.strictEqual(resp, 'beuaaark!');

      assert.strictEqual(puwv.length, 1);
      assert.strictEqual(puwv[0].c, daCtx);
      assert.strictEqual(puwv[0].e, env);
      assert.strictEqual(puwv[0].u.bucket, 'mybucket');
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
        // eslint-disable-next-line class-methods-use-this
        send() {
          throw error;
        }

        middlewareStack = { add: () => {} };
      };

      // Mock getObject to return null (not found) for HEAD requests
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'test-bucket' && org === 'qqqorg') {
          if (key === 'qqqsrc/abc/def.html') {
            return null; // Not found
          } else if (key === 'qqqsrc' || key === 'qqqsrc.props') {
            return null; // Not found
          }
        }
        return null;
      };

      // eslint-disable-next-line no-shadow
      const { copyFile } = await esmock('../../../src/storage/object/copy.js', {
        '@aws-sdk/client-s3': {
          S3Client: mockS3Client,
        },
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = { bucket: 'test-bucket', org: 'qqqorg', origin: 'http://qqq' };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'qqqsrc',
        destination: 'qqqdst',
      };
      const resp = await copyFile({}, env, daCtx, 'qqqsrc/abc/def.html', details, false);
      assert.strictEqual(resp.$metadata.httpStatusCode, 404);
      assert.deepStrictEqual(
        collabCalled,
        ['https://localhost/api/v1/syncadmin?doc=http://qqq/source/qqqorg/qqqdst/abc/def.html'],
      );
    });
  });

  describe('Copies a list of files', async () => {
    it('handles no continuation token', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: 'mydir/xyz.html' }],
      });

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake(((input) => {
        s3Sent.push(input);
      }));

      // Mock getObject to return content type for HEAD requests
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'foo') {
          if (key === 'mydir/xyz.html') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          } else if (key === 'mydir' || key === 'mydir.props') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          }
        }
        return null;
      };

      const env = { dacollab: { fetch: () => {} } };
      const ctx = {
        bucket: 'root-bucket',
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };

      const copyObjectWithMock = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const resp = await copyObjectWithMock.default(env, ctx, details, false);
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
          },
        },
        dacollab: { fetch: () => {} },
      };
      s3Mock.on(ListObjectsV2Command)
        .resolves({
          Contents: [{ Key: 'mydir/xyz.html' }],
          NextContinuationToken: 'token',
        });

      s3Mock.on(ListObjectsV2Command, { ContinuationToken: 'token' })
        .resolves({
          Contents: [{ Key: 'mydir/abc.html' }],
        });

      // Mock getObject to return content type for HEAD requests
      // eslint-disable-next-line no-shadow
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'foo') {
          if (key === 'mydir/xyz.html' || key === 'mydir/abc.html') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          } else if (key === 'mydir' || key === 'mydir.props') {
            return {
              contentType: 'text/html',
              status: 200,
              contentLength: 100,
            };
          }
        }
        return null;
      };

      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake(((input) => {
        s3Sent.push(input);
      }));

      const ctx = {
        bucket: 'root-bucket',
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };

      const copyObjectWithMock = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const resp = await copyObjectWithMock.default(env, ctx, details, false);
      assert.strictEqual(resp.status, 206);
      const { continuationToken } = JSON.parse(resp.body);

      assert.deepStrictEqual(JSON.parse(DA_JOBS[continuationToken]), ['mydir/abc.html']);
      assert.strictEqual(s3Sent.length, 3);
    });

    it('handles a continuation token w/ more', async () => {
      const continuationToken = 'copy-mydir-mydir/newdir-uuid';
      const remaining = [];
      for (let i = 0; i < 900; i += 1) {
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
          },
        },
        dacollab: { fetch: () => {} },
      };

      // Mock getObject to return content type for HEAD requests
      // eslint-disable-next-line no-shadow
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'foo' && key.startsWith('mydir/')) {
          return {
            contentType: 'text/html',
            status: 200,
            contentLength: 100,
          };
        }
        return null;
      };

      const ctx = {
        bucket: 'root-bucket',
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
        continuationToken,
      };
      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake(((input) => {
        s3Sent.push(input);
      }));

      const copyObjectWithMock = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const resp = await copyObjectWithMock.default(env, ctx, details, false);
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
          },
        },
        dacollab: { fetch: () => {} },
      };

      // Mock getObject to return content type for HEAD requests
      // eslint-disable-next-line no-shadow
      const mockGetObject = async (env, { bucket, org, key }, head) => {
        if (head && bucket === 'root-bucket' && org === 'foo' && key === 'mydir/abc.html') {
          return {
            contentType: 'text/html',
            status: 200,
            contentLength: 100,
          };
        }
        return null;
      };

      const ctx = {
        bucket: 'root-bucket',
        org: 'foo',
        key: 'mydir',
        users: [{ email: 'haha@foo.com' }],
      };
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
        continuationToken,
      };
      const s3Sent = [];
      s3Mock.on(CopyObjectCommand).callsFake(((input) => {
        s3Sent.push(input);
      }));

      const copyObjectWithMock = await esmock('../../../src/storage/object/copy.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
      });

      const resp = await copyObjectWithMock.default(env, ctx, details, false);
      assert.strictEqual(resp.status, 204);
      assert.ifError(resp.body);
      assert.strictEqual(s3Sent.length, 1);
      assert.ifError(DA_JOBS[continuationToken]);
    });
  });
});
