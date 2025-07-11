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
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import getObject from '../../../src/storage/object/get.js';
import { putObjectWithVersion } from '../../../src/storage/version/put.js';

import copyObject, { copyFile } from '../../../src/storage/object/copy.js';
import { getAclCtx } from '../../../src/utils/auth.js';

const s3Mock = mockClient(S3Client);

describe('Object copy', () => {
  beforeAll(() => {
    vi.mock('../../../src/storage/object/get.js', () => {
      const actual = vi.importActual('../../../src/storage/object/get.js');
      return {
        default: vi.fn(actual.default)
      };
    });
    vi.mock('../../../src/storage/version/put.js', () => {
      const actual = vi.importActual('../../../src/storage/version/put.js');
      return {
        putObjectWithVersion: vi.fn(actual.putObjectWithVersion)
      };
    });
  });

  beforeEach(() => {
    s3Mock.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(resp.status).to.eq(409);
  });

  it('returns 403 when copying to a location without write permission', async () => {
    const pathLookup = new Map();
    pathLookup.set('aaa@bbb.ccc', [
      {path: '/source/mysrc', actions: ['read']},
      {path: '/source/mydst', actions: ['read']}
    ]);

    const aclCtx = { pathLookup, actionSet: new Set(['read'])};
    const ctx = { aclCtx, key: 'source/mysrc', users: [{email: 'aaa@bbb.ccc'}] };

    const details = {
      source: 'mysrc',
      destination: 'mydst',
    };

    const resp = await copyFile({}, {}, ctx, '/source/mysrc', details, false);
    expect(resp.$metadata.httpStatusCode).to.eq(403);
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
    expect(resp.$metadata.httpStatusCode).to.eq(403);
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
    expect(resp.$metadata.httpStatusCode).to.eq(403);
  });

  it('Copy to location with permission', async () => {
    const pathLookup = new Map();
    pathLookup.set('aaa@bbb.ccc', [
      {path: '/source/mysrc', actions: ['read']},
      {path: '/source/mydst', actions: ['read', 'write']}
    ]);

    const aclCtx = { pathLookup, actionSet: new Set(['read'])};
    const ctx = { aclCtx, key: 'source/mysrc', org: 'org', users: [{email: 'aaa@bbb.ccc'}] };

    const details = {
      source: 'mysrc',
      destination: 'mydst',
    };

    let inputArg;
    s3Mock.on(CopyObjectCommand).callsFake((...input) => {
      inputArg = input[0];
      return { $metadata: { httpStatusCode: 200 } };
    });

    const resp = await copyFile({}, {}, ctx, 'source/mysrc', details, true);
    expect(resp.$metadata.httpStatusCode).to.eq(200);
    expect(inputArg.Bucket).to.eq('org-content');
    expect(inputArg.CopySource).to.eq('org-content/source/mysrc');
    expect(inputArg.Key).to.eq('source/mydst');
    expect(inputArg.MetadataDirective).to.be.undefined;
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
      await copyObject(env, ctx, details, false);

      expect(s3Sent.length).to.eq(3);

      // Make the order in s3Sent predictable
      s3Sent.sort((a, b) => a.Key.localeCompare(b.Key));

      const input = s3Sent[2];
      expect(input.Bucket).to.eq('foo-content');
      expect(input.CopySource).to.eq('foo-content/mydir/xyz.html');
      expect(input.Key).to.eq('mydir/newdir/xyz.html');

      const md = input.Metadata;
      expect(md.ID).not.to.be.null;
      expect(md.Version).not.to.be.null;
      expect(typeof (md.Timestamp)).to.eq('string');
      expect(md.Users).to.eq('[{"email":"haha@foo.com"}]');
      expect(md.Path).to.eq('mydir/newdir/xyz.html');

      expect(collabcalls.length).to.eq(1);
      expect(collabcalls).to.deep.eq(
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
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir/dir1',
        destination: 'mydir/dir2',
      };
      await copyObject(env, ctx, details, true);

      expect(s3Sent.length).to.eq(3);

      // Make the order in s3Sent predictable
      s3Sent.sort((a, b) => a.Key.localeCompare(b.Key));

      const input = s3Sent[2];
      expect(input.Bucket).to.eq('testorg-content');
      expect(input.CopySource).to.eq('testorg-content/mydir/dir1/myfile.html');
      expect(input.Key).to.eq('mydir/dir2/myfile.html');
      expect(input.Metadata).to.be.undefined;

      expect(collabcalls).to.deep.eq(
        ['https://localhost/api/v1/syncAdmin?doc=http://localhost:3000/source/testorg/mydir/dir2/myfile.html']);
    });

    // it('Adds copy condition', async () => {
    //   const msAdded = [];
    //   const mockS3Client = class {
    //     send(command) {
    //       return command;
    //     }
    //     middlewareStack = {
    //       add: (a, b) => {
    //         msAdded.push(a);
    //         msAdded.push(b);
    //       },
    //     };
    //   };
    //
    //   s3Mock.onAnyCommand().callsFake((...input) => {
    //     console.log(input);
    //   })
    //
    //   const collabCalled = [];
    //   const env = {
    //     dacollab: {
    //       fetch: (x) => { collabCalled.push(x); },
    //     },
    //   };
    //   const daCtx = {
    //     org: 'myorg',
    //     origin: 'https://blahblah:7890',
    //     users: [{email: 'joe@bloggs.org', otherstuff: 'blah'}],
    //   };
    //   daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
    //   const details = {
    //     source: 'mysrc',
    //     destination: 'mydst',
    //   };
    //   const resp = await copyFile({}, env, daCtx, 'mysrc/abc/def.html', details, false);
    //
    //   expect(resp.constructor.name).to.eq('CopyObjectCommand');
    //   expect(resp.input.Bucket).to.eq('myorg-content');
    //   expect(resp.input.Key).to.eq('mydst/abc/def.html');
    //   expect(resp.input.CopySource).to.eq('myorg-content/mysrc/abc/def.html');
    //   expect(resp.input.MetadataDirective).to.eq('REPLACE');
    //   expect(resp.input.Metadata.Path).to.eq('mydst/abc/def.html');
    //   expect(resp.input.Metadata.Users).to.eq('[{"email":"joe@bloggs.org"}]');
    //   const mdts = Number(resp.input.Metadata.Timestamp);
    //   expect(mdts + 1000).to.be.greaterThan(Date.now());
    //
    //   expect(msAdded.length).to.eq(2);
    //   const amd = msAdded[1];
    //   expect(amd.step).to.eq('build');
    //   expect(amd.name).to.eq('ifNoneMatchMiddleware');
    //   expect(amd.tags).to.deep.eq(['METADATA', 'IF-NONE-MATCH']);
    //   const func = msAdded[0];
    //
    //   const nxtCalled = [];
    //   const nxt = (args) => {
    //     nxtCalled.push(args);
    //     return 'yay!';
    //   };
    //   const res = await func((nxt));
    //
    //   const args = { request: { foo: 'bar', headers: { aaa: 'bbb' } } };
    //   const res2 = await res(args);
    //   expect(res2).to.eq('yay!');
    //
    //   expect(nxtCalled.length).to.eq(1);
    //   expect(nxtCalled[0].request.foo).to.eq('bar');
    //   expect(nxtCalled[0].request.headers).to.deep.eq(
    //     { aaa: 'bbb', 'cf-copy-destination-if-none-match': '*' });
    //
    //   expect(collabCalled).to.deep.eq(
    //     ['https://localhost/api/v1/syncAdmin?doc=https://blahblah:7890/source/myorg/mydst/abc/def.html']);
    // });

    it('Copy content when destination already exists', async () => {
      const error = {
        $metadata: { httpStatusCode: 412 },
      };
      s3Mock.onAnyCommand().rejects(error);

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

      getObject.mockImplementationOnce(mockGetObject);
      putObjectWithVersion.mockImplementationOnce(mockPutObjectWithVersion);

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = { org: 'xorg' };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'xsrc',
        destination: 'xdst',
      };
      const resp = await copyFile({}, env, daCtx, 'xsrc/abc/def.html', details, false);
      expect(resp).to.eq('beuaaark!');

      expect(puwv.length).to.eq(1);
      expect(puwv[0].c).to.eq(daCtx);
      expect(puwv[0].e).to.eq(env);
      expect(puwv[0].u.body).to.eq('original body');
      expect(puwv[0].u.contentLength).to.eq(42);
      expect(puwv[0].u.key).to.eq('xdst/abc/def.html');
      expect(puwv[0].u.org).to.eq('xorg');
      expect(puwv[0].u.type).to.eq('text/html');
    });

    it('Copy content when origin does not exists', async () => {
      const error = {
        $metadata: { httpStatusCode: 404, hi: 'ha' },
      };
      s3Mock.onAnyCommand().rejects(error);

      const collabCalled = [];
      const env = {
        dacollab: {
          fetch: (x) => { collabCalled.push(x); },
        },
      };
      const daCtx = { org: 'qqqorg', origin: 'http://qqq' };
      daCtx.aclCtx = await getAclCtx(env, daCtx.org, daCtx.users, '/');
      const details = {
        source: 'qqqsrc',
        destination: 'qqqdst',
      };
      const resp = await copyFile({}, env, daCtx, 'qqqsrc/abc/def.html', details, false);
      expect(resp.$metadata).to.eq(error.$metadata);
      expect(collabCalled).to.deep.eq(
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
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };
      const resp = await copyObject(env, ctx, details, false);
      expect(resp.status).to.eq(204);
      expect(resp.body).to.be.undefined;
      expect(s3Sent.length).to.eq(3);
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
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
      const details = {
        source: 'mydir',
        destination: 'mydir/newdir',
      };
      const resp = await copyObject(env, ctx, details, false);
      expect(resp.status).to.eq(206);
      const { continuationToken } = JSON.parse(resp.body);

      expect(JSON.parse(DA_JOBS[continuationToken])).to.deep.eq(['mydir/abc.html']);
      expect(s3Sent.length).to.eq(3);
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
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
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
      expect(resp.status).to.eq(206);
      expect(JSON.parse(resp.body)).to.deep.eq({ continuationToken });
      expect(s3Sent.length).to.eq(900);
      expect(JSON.parse(DA_JOBS[continuationToken])).to.deep.eq(['mydir/abc.html']);
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
      ctx.aclCtx = await getAclCtx(env, ctx.org, ctx.users, '/');
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
      expect(resp.status).to.eq(204);
      expect(resp.body).to.be.undefined;
      expect(s3Sent.length).to.eq(1);
      expect(DA_JOBS[continuationToken]).to.be.undefined;
    });
  });
});
