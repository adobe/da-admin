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
/* eslint-disable no-unused-vars,camelcase */
import assert from 'node:assert';
import esmock from 'esmock';

describe('Version Put', () => {
  it('Test putObjectWithVersion retry on new document', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({ e, u, nb });
      return {
        status: 404,
        metadata: {},
      };
    };

    let firstCall = true;
    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        const resp = {
          $metadata: {
            httpStatusCode: firstCall ? 412 : 200,
          },
        };
        if (firstCall) {
          firstCall = false;
          throw resp;
        } else {
          return resp;
        }
      },
    };

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    const mockEnv = { foo: 'bar' };
    const mockUpdate = 'haha';
    const mockCtx = { users: [{ email: 'foo@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, mockUpdate, false);

    assert.equal(201, resp.status);
    assert(resp.metadata.id);
    assert.equal(2, getObjectCalls.length);
    assert.equal(getObjectCalls[0].e, mockEnv);
    assert.equal(getObjectCalls[0].u, mockUpdate);
    assert.equal(getObjectCalls[0].nb, false);
    assert.equal(getObjectCalls[1].e, mockEnv);
    assert.equal(getObjectCalls[1].u, mockUpdate);
    assert.equal(getObjectCalls[1].nb, false);

    assert.equal(2, sendCalls.length);
    assert.strictEqual(sendCalls[0].input.Metadata.Users, JSON.stringify(mockCtx.users));
    assert.strictEqual(sendCalls[1].input.Metadata.Users, JSON.stringify(mockCtx.users));
  });

  it('Test putObjectWithVersion error', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({ e, u, nb });
      return {
        status: 404,
        metadata: {},
      };
    };

    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        const resp = {
          $metadata: {
            httpStatusCode: 510,
          },
        };
        throw resp;
      },
    };

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    const mockEnv = { foo: 'bar' };
    const mockCtx = { users: [{ email: 'foo@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, 'haha', false);
    assert.equal(510, resp.status);
  });

  it('Test putObjectWithVersion retry on existing document', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({ e, u, nb });
      return {
        status: 200,
        metadata: {},
      };
    };

    let firstCall = true;
    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        const resp = {
          $metadata: {
            httpStatusCode: firstCall ? 412 : 200,
          },
        };
        if (firstCall) {
          firstCall = false;
          throw resp;
        } else {
          return resp;
        }
      },
    };
    const mockS3PutClient = {
      async send(cmd) {
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3PutClient,
      },
    });

    const mockEnv = { hi: 'ha' };
    const mockUpdate = 'hoho';
    const mockCtx = { users: [{ email: 'blah@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, mockUpdate, true);

    assert.equal(200, resp.status);
    assert.equal(2, getObjectCalls.length);
    assert.equal(getObjectCalls[0].e, mockEnv);
    assert.equal(getObjectCalls[0].u, mockUpdate);
    assert.equal(getObjectCalls[0].nb, false);
    assert.equal(getObjectCalls[1].e, mockEnv);
    assert.equal(getObjectCalls[1].u, mockUpdate);
    assert.equal(getObjectCalls[1].nb, false);

    assert.equal(2, sendCalls.length);
    assert.strictEqual(sendCalls[0].input.Metadata.Users, JSON.stringify(mockCtx.users));
    assert.strictEqual(sendCalls[1].input.Metadata.Users, JSON.stringify(mockCtx.users));
  });

  it('Test putObjectWithVersion retry fails on existing document', async () => {
    const getObjectCalls = [];
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({ e, u, nb });
      return {
        status: 200,
        metadata: {},
      };
    };

    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        throw new Error('testing 123');
      },
    };
    const mockS3PutClient = {
      async send(cmd) {
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3PutClient,
      },
    });

    const mockEnv = { hi: 'ha' };
    const mockUpdate = 'hoho';
    const mockCtx = { users: [{ email: 'blah@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, mockUpdate, true);
    assert.equal(500, resp.status);
  });

  it('Put Object With Version store content', async () => {
    // eslint-disable-next-line consistent-return
    const mockGetObject = async (e, u, h) => {
      if (!h) {
        return {
          body: 'prevbody',
          contentType: 'text/html',
          metadata: {
            id: 'x123',
            version: 'aaa-bbb',
          },
          status: 200,
        };
      }
    };

    const s3VersionSent = [];
    const mockS3VersionClient = {
      send: (c) => {
        s3VersionSent.push(c);
        return { $metadata: { httpStatusCode: 200 } };
      },
    };
    const mockIfNoneMatch = () => mockS3VersionClient;

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return { $metadata: { httpStatusCode: 200 } };
      },
    };
    const mockIfMatch = () => mockS3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch,
        ifMatch: mockIfMatch,
      },
    });

    const env = {};
    const daCtx = { bucket: 'bkt', org: 'myorg', ext: 'html' };
    const update = {
      bucket: 'bkt', body: 'new-body', org: 'myorg', key: 'a/x.html',
    };
    const resp = await putObjectWithVersion(env, daCtx, update, true);
    assert.equal(200, resp.status);
    assert.equal('x123', resp.metadata.id);
    assert.equal(1, s3VersionSent.length);
    assert.equal('prevbody', s3VersionSent[0].input.Body);
    assert.equal('bkt', s3VersionSent[0].input.Bucket);
    assert.equal('myorg/.da-versions/x123/aaa-bbb.html', s3VersionSent[0].input.Key);
    assert.equal('[{"email":"anonymous"}]', s3VersionSent[0].input.Metadata.Users);
    assert.equal('a/x.html', s3VersionSent[0].input.Metadata.Path);
    assert(s3VersionSent[0].input.Metadata.Timestamp > 0);

    assert.equal(1, s3Sent.length);
    assert.equal('new-body', s3Sent[0].input.Body);
    assert.equal('bkt', s3Sent[0].input.Bucket);
    assert.equal('myorg/a/x.html', s3Sent[0].input.Key);
    assert.equal('x123', s3Sent[0].input.Metadata.ID);
    assert.equal('a/x.html', s3Sent[0].input.Metadata.Path);
    assert.notEqual('aaa-bbb', s3Sent[0].input.Metadata.Version);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
  });

  it('Put Object With Version don\'t store content', async () => {
    // eslint-disable-next-line consistent-return
    const mockGetObject = async (e, u, h) => {
      if (!h) {
        return {
          body: 'prevbody',
          contentType: 'text/html',
          metadata: {
            id: 'q123-456',
            preparsingstore: Date.now(),
            version: 'ver123',
          },
          status: 201,
        };
      }
    };

    const s3VersionSent = [];
    const mockS3VersionClient = {
      send: (c) => {
        s3VersionSent.push(c);
        return { $metadata: { httpStatusCode: 200 } };
      },
    };
    const mockIfNoneMatch = () => mockS3VersionClient;

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return { $metadata: { httpStatusCode: 202 } };
      },
    };
    const mockIfMatch = () => mockS3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch,
        ifMatch: mockIfMatch,
      },
    });

    const env = {};
    const daCtx = {
      bucket: 'bbb', org: 'myorg', ext: 'html', users: [{ email: 'foo@acme.org' }, { email: 'bar@acme.org' }],
    };
    const update = {
      bucket: 'bbb', body: 'new-body', org: 'myorg', key: 'a/x.html', contentType: 'text/html',
    };
    const resp = await putObjectWithVersion(env, daCtx, update, false);
    assert.equal(202, resp.status);
    assert.equal('q123-456', resp.metadata.id);
    assert.equal(1, s3VersionSent.length);
    assert.equal('', s3VersionSent[0].input.Body);
    assert.equal('bbb', s3VersionSent[0].input.Bucket);
    assert.equal('myorg/.da-versions/q123-456/ver123.html', s3VersionSent[0].input.Key);
    assert.equal('[{"email":"anonymous"}]', s3VersionSent[0].input.Metadata.Users);
    assert.equal('a/x.html', s3VersionSent[0].input.Metadata.Path);
    assert(s3VersionSent[0].input.Metadata.Timestamp > 0);

    assert.equal(1, s3Sent.length);
    assert.equal('new-body', s3Sent[0].input.Body);
    assert.equal('bbb', s3Sent[0].input.Bucket);
    assert.equal('myorg/a/x.html', s3Sent[0].input.Key);
    assert.equal('q123-456', s3Sent[0].input.Metadata.ID);
    assert.equal('a/x.html', s3Sent[0].input.Metadata.Path);
    assert.equal('[{"email":"foo@acme.org"},{"email":"bar@acme.org"}]', s3Sent[0].input.Metadata.Users);
    assert.notEqual('aaa-bbb', s3Sent[0].input.Metadata.Version);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert((s3Sent[0].input.Metadata.Preparsingstore - s3Sent[0].input.Metadata.Timestamp) < 100);
  });

  it('Put First Object With Version', async () => {
    // eslint-disable-next-line consistent-return
    const mockGetObject = async (e, u, h) => {
      if (!h) {
        return {
          status: 404,
        };
      }
    };

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockIfNoneMatch = () => mockS3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch,
      },
    });

    const env = {};
    const daCtx = { bucket: 'b-b', org: 'myorg' };
    const update = {
      bucket: 'b-b',
      org: 'myorg',
      key: 'a/b/c',
      type: 'text/html',
    };
    const resp = await putObjectWithVersion(env, daCtx, update, true);
    assert.equal(201, resp.status);
    assert(resp.metadata.id, 'The ID should be set');

    assert.equal(1, s3Sent.length);
    assert.equal('b-b', s3Sent[0].input.Bucket);
    assert(s3Sent[0].input.Metadata.ID);
    assert.equal('a/b/c', s3Sent[0].input.Metadata.Path);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert(s3Sent[0].input.Metadata.Version);
  });

  it('Put Object With Version ID clash', async () => {
    const mockGetObject = async (e, u, h) => ({ metadata: { id: 'x123' }, status: 200 });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
    });

    const resp = await putObjectWithVersion({}, {}, {}, false, 'y999');
    assert.equal(409, resp.status);
  });

  it('Put First Object With ID provided', async () => {
    const mockGetObject = async (e, u, h) => ({ status: 404 });

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockIfNoneMatch = () => mockS3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch,
      },
    });

    const update = { org: 'orgOne', key: '/root/somedoc.html' };
    const resp = await putObjectWithVersion({}, {}, update, true, 'myidAAA');
    assert.equal(201, resp.status);
    assert.equal('myidAAA', resp.metadata.id);
  });

  it('Post Object With Version creates new version', async () => {
    const req = {
      json: () => ({
        label: 'foobar',
      }),
    };
    const env = {};
    const ctx = {
      bucket: 'mybucket',
      org: 'org123',
      key: 'q/r/t',
    };

    // eslint-disable-next-line consistent-return
    const mockGetObject = async (e, u, h) => {
      if (e === env && !h) {
        const body = ReadableStream.from('doccontent');
        return {
          body,
          contentType: 'text/html',
          contentLength: 10,
        };
      }
    };

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockIfMatch = () => mockS3Client;

    const s3INMSent = [];
    const mockS3INMClient = {
      send: (c) => {
        s3INMSent.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockIfNoneMatch = () => mockS3INMClient;

    const { postObjectVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: mockIfMatch,
        ifNoneMatch: mockIfNoneMatch,
      },
    });

    const resp = await postObjectVersion(req, env, ctx);
    assert.equal(201, resp.status);
    assert.equal(1, s3INMSent.length);
    assert(s3INMSent[0].input.Body instanceof ReadableStream);
    assert.equal('mybucket', s3INMSent[0].input.Bucket);
    assert.equal('q/r/t', s3INMSent[0].input.Metadata.Path);
    assert(s3INMSent[0].input.Metadata.Timestamp > 0);
    assert.equal('[{"email":"anonymous"}]', s3INMSent[0].input.Metadata.Users);
    assert.equal('foobar', s3INMSent[0].input.Metadata.Label);
    assert.equal(10, s3INMSent[0].input.ContentLength);

    assert.equal(1, s3Sent.length);
    assert(s3Sent[0].input.Body instanceof ReadableStream);
    assert.equal('mybucket', s3Sent[0].input.Bucket);
    assert.equal('org123/q/r/t', s3Sent[0].input.Key);
    assert.equal('q/r/t', s3Sent[0].input.Metadata.Path);
    assert(s3Sent[0].input.Metadata.ID);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert(s3Sent[0].input.Metadata.Version);
    assert.equal('text/html', s3Sent[0].input.ContentType);
    assert.equal(10, s3Sent[0].input.ContentLength);

    assert(s3INMSent[0].input.Body !== s3Sent[0].input.Body);
  });

  it('Test putObjectWithVersion HEAD', async () => {
    const mockGetObject = async () => {
      const metadata = {
        id: 'idabc',
        version: '101',
        path: '/q',
        timestamp: 123,
        users: '[{"email":"anonymous"}]',
        preparsingstore: 12345,
      };
      return { body: '', metadata, contentLength: 616 };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 201,
          },
        };
      },
    };
    const mockS3Client = () => s3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
      },
    });

    const resp = await putObjectWithVersion({}, { method: 'HEAD' }, { type: 'text/html' });
    assert.equal(1, sentToS3.length);
    const { input } = sentToS3[0];
    assert.equal('', input.Body, 'Empty body for HEAD');
    assert.equal(0, input.ContentLength, 'Should have used 0 as content length for HEAD');
    assert.equal('/q', input.Metadata.Path);
    assert.equal(123, input.Metadata.Timestamp);
    assert.equal('[{"email":"anonymous"}]', input.Metadata.Users);
  });

  it('Test putObjectWithVersion BODY', async () => {
    const mockGetObject = async () => {
      const metadata = {
        id: 'idabc',
        version: '101',
        path: '/qwerty',
        timestamp: 1234,
      };
      return {
        body: 'Somebody...',
        contentType: 'text/html',
        metadata,
        contentLength: 616,
      };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockS3Client = () => s3Client;

    const sentToS3_2 = [];
    const s3Client2 = {
      send: async (c) => {
        sentToS3_2.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockS3Client2 = () => s3Client2;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
        ifMatch: mockS3Client2,
      },
    });

    const update = {
      org: 'o1',
      body: 'foobar',
      key: 'mypath',
      type: 'text/html',
    };
    const ctx = {
      org: 'o1',
      users: [{ email: 'hi@acme.com' }],
    };
    await putObjectWithVersion({}, ctx, update, true);
    assert.equal(1, sentToS3.length);
    const { input } = sentToS3[0];
    assert.equal('Somebody...', input.Body);
    assert.equal(616, input.ContentLength);
    assert.equal('/qwerty', input.Metadata.Path);
    assert.equal(1234, input.Metadata.Timestamp);
    assert.equal('[{"email":"anonymous"}]', input.Metadata.Users);

    assert.equal(1, sentToS3_2.length);
    const input2 = sentToS3_2[0].input;
    assert.equal('foobar', input2.Body);
    assert.equal(6, input2.ContentLength);
    assert.equal('text/html', input2.ContentType);
    assert.equal('o1/mypath', input2.Key);
    assert.equal('mypath', input2.Metadata.Path);
    assert.equal('[{"email":"hi@acme.com"}]', input2.Metadata.Users);
    assert(input2.Metadata.Version && input2.Metadata.Version !== 101);
  });

  it('Test putObjectWithVersion BODY - new BODY is empty creates a restore point', async () => {
    const mockGetObject = async () => {
      const metadata = {
        id: 'idabc',
        version: '101',
        path: '/qwerty',
        timestamp: 1234,
      };
      return { body: 'Somebody...', metadata, contentLength: 616 };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockS3Client = () => s3Client;

    const sentToS3_2 = [];
    const s3Client2 = {
      send: async (c) => {
        sentToS3_2.push(c);
        return {
          $metadata: {
            httpStatusCode: 200,
          },
        };
      },
    };
    const mockS3Client2 = () => s3Client2;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
        ifMatch: mockS3Client2,
      },
    });

    const update = {
      org: 'o1',
      body: '',
      key: 'mypath',
      type: 'text/html',
    };
    const ctx = {
      org: 'o1',
      users: [{ email: 'hi@acme.com' }],
      method: 'PUT',
      ext: 'html',
    };

    await putObjectWithVersion({}, ctx, update, true);

    assert.equal(1, sentToS3.length);
    const { input } = sentToS3[0];

    assert.equal('Somebody...', input.Body);
    assert.equal(616, input.ContentLength);
    assert.equal('/qwerty', input.Metadata.Path);
    assert.equal(1234, input.Metadata.Timestamp);
    assert.equal('[{"email":"anonymous"}]', input.Metadata.Users);
    assert.equal('Restore Point', input.Metadata.Label);

    assert.equal(1, sentToS3_2.length);
    const input2 = sentToS3_2[0].input;
    assert.equal('', input2.Body);
    assert.equal(0, input2.ContentLength);
    assert.equal('text/html', input2.ContentType);
    assert.equal('o1/mypath', input2.Key);
    assert.equal('mypath', input2.Metadata.Path);
    assert.equal('[{"email":"hi@acme.com"}]', input2.Metadata.Users);
    assert(input2.Metadata.Version && input2.Metadata.Version !== 101);
  });

  it('exception without metadata', async () => {
    const s3client1 = {
      send: async (c) => {
        const e = new Error('Test error1');
        e.$metadata = { httpStatusCode: 418 };
        throw e;
      },
    };
    const s3client2 = {
      send: async (c) => {
        throw new Error('Test error2');
      },
    };
    const s3client3 = {
      send: async (c) => {
        const e = new Error('Test error3');
        e.$metadata = {};
        throw e;
      },
    };
    let s3Client = null;
    const mockS3Client = () => s3Client;

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
      },
    });

    s3Client = s3client1;
    const resp = await putVersion({}, { Body: 'hello' });
    assert.equal(418, resp.status);
    s3Client = s3client2;
    const resp2 = await putVersion({}, { Body: 'hello' });
    assert.equal(500, resp2.status);
    s3Client = s3client3;
    const resp3 = await putVersion({}, { Body: 'hello' });
    assert.equal(500, resp3.status);
  });

  it('Test putVersion preserves ContentType', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    const testParams = {
      Bucket: 'test-bucket',
      Org: 'test-org',
      Body: 'test content',
      ID: 'test-id',
      Version: 'test-version',
      Ext: 'html',
      Metadata: { test: 'metadata' },
      ContentLength: 12,
      ContentType: 'text/html',
    };

    await putVersion({}, testParams);

    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'test-bucket');
    assert.strictEqual(putCommand.input.Key, 'test-org/.da-versions/test-id/test-version.html');
    assert.strictEqual(putCommand.input.Body, 'test content');
    assert.strictEqual(putCommand.input.ContentLength, 12);
    assert.strictEqual(putCommand.input.ContentType, 'text/html');
    assert.deepStrictEqual(putCommand.input.Metadata, { test: 'metadata' });
  });

  it('Test putObjectWithVersion passes ContentType to putVersion', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const mockGetObject = async () => ({
      status: 200,
      body: 'test body',
      contentLength: 9,
      contentType: 'text/html',
      metadata: { existing: 'metadata' },
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
        ifMatch: () => mockS3Client,
        generateId: () => 'generated-id',
        generateVersion: () => 'generated-version',
      },
    });

    const env = {};
    const daCtx = {
      org: 'test-org',
      ext: 'txt',
      users: [{ email: 'test@example.com' }],
    };

    await putObjectWithVersion(env, daCtx, { key: 'test-file.html', type: 'text/html' }, 'test body', 'test-guid');

    assert.strictEqual(sentCommands.length, 2); // Version + main file
    const putCommand = sentCommands[0]; // First command is the version
    assert.strictEqual(putCommand.input.ContentType, 'text/html');
    assert.strictEqual(putCommand.input.Body, 'test body');
    assert.strictEqual(putCommand.input.ContentLength, 9);
  });

  it('Test putVersion with JPEG binary content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Simulate JPEG binary data
    const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
    const jpegFile = new File([jpegData], 'image.jpg', { type: 'image/jpeg' });

    const testParams = {
      Bucket: 'media-bucket',
      Org: 'testorg',
      Body: jpegFile,
      ID: 'jpeg-id-123',
      Version: 'jpeg-version-1',
      Ext: 'jpg',
      Metadata: { Users: '["user@example.com"]', Path: 'images/photo.jpg' },
      ContentType: 'image/jpeg',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'media-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/jpeg-id-123/jpeg-version-1.jpg');
    assert.strictEqual(putCommand.input.Body, jpegFile);
    assert.strictEqual(putCommand.input.ContentType, 'image/jpeg');
    assert.strictEqual(putCommand.input.Metadata.Users, '["user@example.com"]');
    assert.strictEqual(putCommand.input.Metadata.Path, 'images/photo.jpg');
  });

  it('Test putVersion with PNG binary content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Simulate PNG binary data
    const pngData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const pngFile = new File([pngData], 'image.png', { type: 'image/png' });

    const testParams = {
      Bucket: 'media-bucket',
      Org: 'testorg',
      Body: pngFile,
      ID: 'png-id-456',
      Version: 'png-version-1',
      Ext: 'png',
      Metadata: { Users: '["user@example.com"]', Path: 'images/graphic.png' },
      ContentType: 'image/png',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'media-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/png-id-456/png-version-1.png');
    assert.strictEqual(putCommand.input.Body, pngFile);
    assert.strictEqual(putCommand.input.ContentType, 'image/png');
  });

  it('Test putVersion with MP4 video content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Simulate MP4 binary data
    const mp4Data = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
    const mp4File = new File([mp4Data], 'video.mp4', { type: 'video/mp4' });

    const testParams = {
      Bucket: 'media-bucket',
      Org: 'testorg',
      Body: mp4File,
      ID: 'video-id-789',
      Version: 'video-version-1',
      Ext: 'mp4',
      Metadata: { Users: '["user@example.com"]', Path: 'videos/demo.mp4' },
      ContentType: 'video/mp4',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'media-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/video-id-789/video-version-1.mp4');
    assert.strictEqual(putCommand.input.Body, mp4File);
    assert.strictEqual(putCommand.input.ContentType, 'video/mp4');
  });

  it('Test putVersion with SVG image content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // SVG is text-based but still an image
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>';
    const svgFile = new File([svgContent], 'graphic.svg', { type: 'image/svg+xml' });

    const testParams = {
      Bucket: 'media-bucket',
      Org: 'testorg',
      Body: svgFile,
      ID: 'svg-id-abc',
      Version: 'svg-version-1',
      Ext: 'svg',
      Metadata: { Users: '["user@example.com"]', Path: 'images/icon.svg' },
      ContentType: 'image/svg+xml',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'media-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/svg-id-abc/svg-version-1.svg');
    assert.strictEqual(putCommand.input.Body, svgFile);
    assert.strictEqual(putCommand.input.ContentType, 'image/svg+xml');
  });

  it('Test putObjectWithVersion with JPEG preserves binary content on update', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    // Simulate existing JPEG file
    const existingJpegData = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46,
    ]);
    const mockGetObject = async () => ({
      status: 200,
      body: existingJpegData,
      contentLength: existingJpegData.length,
      contentType: 'image/jpeg',
      etag: 'test-etag',
      metadata: {
        id: 'jpeg-id-existing',
        version: 'jpeg-version-old',
        timestamp: '1234567890',
        users: '["olduser@example.com"]',
        path: 'images/photo.jpg',
      },
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
        ifMatch: () => mockS3Client,
      },
    });

    const env = {};
    const daCtx = {
      org: 'testorg',
      ext: 'jpg',
      users: [{ email: 'newuser@example.com' }],
    };

    // New JPEG data to upload
    const newJpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10, 0x4A, 0x46]);
    const newJpegFile = new File([newJpegData], 'photo.jpg', { type: 'image/jpeg' });

    const update = {
      bucket: 'media-bucket',
      org: 'testorg',
      key: 'images/photo.jpg',
      body: newJpegFile,
      type: 'image/jpeg',
    };

    const result = await putObjectWithVersion(env, daCtx, update, true);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.metadata.id, 'jpeg-id-existing');

    // Binary files (like JPEG) do NOT create versions, only 1 command for main object
    assert.strictEqual(sentCommands.length, 1);

    // Only command should store the new main object (no version for binaries)
    const mainCommand = sentCommands[0];
    assert.strictEqual(mainCommand.input.Bucket, 'media-bucket');
    assert.strictEqual(mainCommand.input.Key, 'testorg/images/photo.jpg');
    assert.strictEqual(mainCommand.input.Body, newJpegFile);
    assert.strictEqual(mainCommand.input.ContentType, 'image/jpeg');
  });

  it('Test putVersion with PDF document content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Simulate PDF binary data
    const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    const pdfFile = new File([pdfData], 'document.pdf', { type: 'application/pdf' });

    const testParams = {
      Bucket: 'docs-bucket',
      Org: 'testorg',
      Body: pdfFile,
      ID: 'pdf-id-123',
      Version: 'pdf-version-1',
      Ext: 'pdf',
      Metadata: { Users: '["user@example.com"]', Path: 'documents/report.pdf' },
      ContentType: 'application/pdf',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'docs-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/pdf-id-123/pdf-version-1.pdf');
    assert.strictEqual(putCommand.input.Body, pdfFile);
    assert.strictEqual(putCommand.input.ContentType, 'application/pdf');
  });

  it('Test putVersion with ZIP archive content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Simulate ZIP binary data
    const zipData = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const zipFile = new File([zipData], 'archive.zip', { type: 'application/zip' });

    const testParams = {
      Bucket: 'files-bucket',
      Org: 'testorg',
      Body: zipFile,
      ID: 'zip-id-456',
      Version: 'zip-version-1',
      Ext: 'zip',
      Metadata: { Users: '["user@example.com"]', Path: 'downloads/archive.zip' },
      ContentType: 'application/zip',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'files-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/zip-id-456/zip-version-1.zip');
    assert.strictEqual(putCommand.input.Body, zipFile);
    assert.strictEqual(putCommand.input.ContentType, 'application/zip');
  });

  it('Test putVersion with generic binary content (octet-stream)', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Generic binary data
    const binaryData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE]);
    const binaryFile = new File([binaryData], 'data.bin', { type: 'application/octet-stream' });

    const testParams = {
      Bucket: 'storage-bucket',
      Org: 'testorg',
      Body: binaryFile,
      ID: 'binary-id-789',
      Version: 'binary-version-1',
      Ext: 'bin',
      Metadata: { Users: '["user@example.com"]', Path: 'files/data.bin' },
      ContentType: 'application/octet-stream',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'storage-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/binary-id-789/binary-version-1.bin');
    assert.strictEqual(putCommand.input.Body, binaryFile);
    assert.strictEqual(putCommand.input.ContentType, 'application/octet-stream');
  });

  it('Test putVersion with audio file content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Simulate MP3 audio data
    const mp3Data = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
    const mp3File = new File([mp3Data], 'audio.mp3', { type: 'audio/mpeg' });

    const testParams = {
      Bucket: 'media-bucket',
      Org: 'testorg',
      Body: mp3File,
      ID: 'audio-id-abc',
      Version: 'audio-version-1',
      Ext: 'mp3',
      Metadata: { Users: '["user@example.com"]', Path: 'media/song.mp3' },
      ContentType: 'audio/mpeg',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'media-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/audio-id-abc/audio-version-1.mp3');
    assert.strictEqual(putCommand.input.Body, mp3File);
    assert.strictEqual(putCommand.input.ContentType, 'audio/mpeg');
  });

  it('Test putVersion with HTML file content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Create HTML content
    const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><h1>Hello World</h1></body>
</html>`;
    const htmlFile = new File([htmlContent], 'page.html', { type: 'text/html' });

    const testParams = {
      Bucket: 'content-bucket',
      Org: 'testorg',
      Body: htmlFile,
      ID: 'html-id-def',
      Version: 'html-version-1',
      Ext: 'html',
      Metadata: { Users: '["user@example.com"]', Path: 'pages/index.html' },
      ContentType: 'text/html',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'content-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/html-id-def/html-version-1.html');
    assert.strictEqual(putCommand.input.Body, htmlFile);
    assert.strictEqual(putCommand.input.ContentType, 'text/html');
  });

  it('Test putVersion with JSON file content', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
      },
    });

    // Create JSON content
    const jsonContent = JSON.stringify({
      name: 'Test Config',
      version: '2.0',
      features: ['feature1', 'feature2'],
    }, null, 2);
    const jsonFile = new File([jsonContent], 'config.json', { type: 'application/json' });

    const testParams = {
      Bucket: 'data-bucket',
      Org: 'testorg',
      Body: jsonFile,
      ID: 'json-id-ghi',
      Version: 'json-version-1',
      Ext: 'json',
      Metadata: { Users: '["user@example.com"]', Path: 'config/settings.json' },
      ContentType: 'application/json',
    };

    const result = await putVersion({}, testParams);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.Bucket, 'data-bucket');
    assert.strictEqual(putCommand.input.Key, 'testorg/.da-versions/json-id-ghi/json-version-1.json');
    assert.strictEqual(putCommand.input.Body, jsonFile);
    assert.strictEqual(putCommand.input.ContentType, 'application/json');
  });

  it('Test putObjectWithVersion with HTML preserves content on update', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 },
        };
      },
    };

    // Simulate existing HTML file
    const existingHtmlContent = '<html><body><h1>Old Version</h1></body></html>';
    const mockGetObject = async () => ({
      status: 200,
      body: existingHtmlContent,
      contentLength: existingHtmlContent.length,
      contentType: 'text/html',
      etag: 'test-etag-html',
      metadata: {
        id: 'html-id-existing',
        version: 'html-version-old',
        timestamp: '1234567890',
        users: '["olduser@example.com"]',
        path: 'pages/index.html',
      },
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject,
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
        ifMatch: () => mockS3Client,
      },
    });

    const env = {};
    const daCtx = {
      org: 'testorg',
      ext: 'html',
      users: [{ email: 'newuser@example.com' }],
    };

    // New HTML content to upload
    const newHtmlContent = '<html><body><h1>New Version</h1><p>Updated content</p></body></html>';
    const newHtmlFile = new File([newHtmlContent], 'index.html', { type: 'text/html' });

    const update = {
      bucket: 'content-bucket',
      org: 'testorg',
      key: 'pages/index.html',
      body: newHtmlFile,
      type: 'text/html',
    };

    const result = await putObjectWithVersion(env, daCtx, update, true);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.metadata.id, 'html-id-existing');

    // Should have 2 commands: one for version, one for main object
    assert.strictEqual(sentCommands.length, 2);

    // First command should store the old version
    const versionCommand = sentCommands[0];
    assert.strictEqual(versionCommand.input.Bucket, 'content-bucket');
    assert(versionCommand.input.Key.includes('.da-versions/html-id-existing/'));
    assert(versionCommand.input.Key.endsWith('.html'));
    assert.strictEqual(versionCommand.input.Body, existingHtmlContent);
    assert.strictEqual(versionCommand.input.ContentType, 'text/html');
    assert.strictEqual(versionCommand.input.ContentLength, existingHtmlContent.length);

    // Second command should store the new content
    const mainCommand = sentCommands[1];
    assert.strictEqual(mainCommand.input.Bucket, 'content-bucket');
    assert.strictEqual(mainCommand.input.Key, 'testorg/pages/index.html');
    assert.strictEqual(mainCommand.input.Body, newHtmlFile);
    assert.strictEqual(mainCommand.input.ContentType, 'text/html');
  });

  describe('Versioning behavior: CREATE vs UPDATE', () => {
    it('JPEG: Binary files NEVER create versions (first or second POST)', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        // First call: file doesn't exist
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        // Second call: file exists
        return {
          status: 200,
          body: new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]),
          contentLength: 4,
          contentType: 'image/jpeg',
          etag: 'old-etag',
          metadata: {
            id: 'jpeg-id-123',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'images/photo.jpg',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10]);
      const jpegFile = new File([jpegData], 'photo.jpg', { type: 'image/jpeg' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'images/photo.jpg',
        users: [{ email: 'user@example.com' }],
      };

      // FIRST CALL - file doesn't exist (404)
      const update1 = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'images/photo.jpg',
        body: jpegFile,
        contentLength: jpegData.length,
        type: 'image/jpeg',
      };

      sentCommands.length = 0;
      const result1 = await putObjectWithVersion(env, daCtx, update1);
      // File created for first time - could be 200 or 201
      assert(result1.status === 200 || result1.status === 201);
      // Only 1 command: PutObject for main file, NO version created
      assert.strictEqual(sentCommands.length, 1);
      assert.strictEqual(sentCommands[0].input.Key, 'testorg/images/photo.jpg');

      // SECOND CALL - file exists (200) - STILL NO VERSION for binaries
      sentCommands.length = 0;
      const result2 = await putObjectWithVersion(env, daCtx, update1);
      assert(result2.status === 200 || result2.status === 201);
      // Only 1 command: PutObject for main file, NO version for binaries
      assert.strictEqual(sentCommands.length, 1);
      assert.strictEqual(sentCommands[0].input.Key, 'testorg/images/photo.jpg');
    });

    it('PNG: Binary files NEVER create versions (first or second POST)', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
          contentLength: 4,
          contentType: 'image/png',
          etag: 'old-etag',
          metadata: {
            id: 'png-id-456',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'images/graphic.png',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const pngData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const pngFile = new File([pngData], 'graphic.png', { type: 'image/png' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'images/graphic.png',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'images/graphic.png',
        body: pngFile,
        contentLength: pngData.length,
        type: 'image/png',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - still no version for binaries
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);
    });

    it('HTML: New file (404) creates object WITHOUT version, existing file creates version', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: '<html><body><h1>Old</h1></body></html>',
          contentLength: 40,
          contentType: 'text/html',
          etag: 'old-etag',
          metadata: {
            id: 'html-id-789',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'pages/index.html',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const htmlContent = '<!DOCTYPE html><html><body><h1>New</h1></body></html>';
      const htmlFile = new File([htmlContent], 'index.html', { type: 'text/html' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'pages/index.html',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'pages/index.html',
        body: htmlFile,
        contentLength: htmlContent.length,
        type: 'text/html',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - creates version for HTML
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 2);
    });

    it('JSON: New file (404) creates object WITHOUT version, existing file creates version', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: JSON.stringify({ version: '1.0' }),
          contentLength: 20,
          contentType: 'application/json',
          etag: 'old-etag',
          metadata: {
            id: 'json-id-abc',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'config/settings.json',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const jsonContent = JSON.stringify({ version: '2.0', features: ['new'] });
      const jsonFile = new File([jsonContent], 'settings.json', { type: 'application/json' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'config/settings.json',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'config/settings.json',
        body: jsonFile,
        contentLength: jsonContent.length,
        type: 'application/json',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - creates version for JSON
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 2);
    });

    it('PDF: Binary files NEVER create versions (first or second POST)', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          contentLength: 4,
          contentType: 'application/pdf',
          etag: 'old-etag',
          metadata: {
            id: 'pdf-id-def',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'docs/report.pdf',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const pdfFile = new File([pdfData], 'report.pdf', { type: 'application/pdf' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'docs/report.pdf',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'docs/report.pdf',
        body: pdfFile,
        contentLength: pdfData.length,
        type: 'application/pdf',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - still no version for binaries
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);
    });

    it('MP4: Binary files NEVER create versions (first or second POST)', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
          contentLength: 8,
          contentType: 'video/mp4',
          etag: 'old-etag',
          metadata: {
            id: 'mp4-id-ghi',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'videos/demo.mp4',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const mp4Data = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D,
      ]);
      const mp4File = new File([mp4Data], 'demo.mp4', { type: 'video/mp4' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'videos/demo.mp4',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'videos/demo.mp4',
        body: mp4File,
        contentLength: mp4Data.length,
        type: 'video/mp4',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - still no version for binaries
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);
    });

    it('SVG: Binary files NEVER create versions (first or second POST)', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>',
          contentLength: 80,
          contentType: 'image/svg+xml',
          etag: 'old-etag',
          metadata: {
            id: 'svg-id-jkl',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'images/icon.svg',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>';
      const svgFile = new File([svgContent], 'icon.svg', { type: 'image/svg+xml' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'images/icon.svg',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'images/icon.svg',
        body: svgFile,
        contentLength: svgContent.length,
        type: 'image/svg+xml',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - still no version for binaries
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);
    });

    it('ZIP: Binary files NEVER create versions (first or second POST)', async () => {
      const sentCommands = [];
      let callCount = 0;

      const mockGetObject = async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            status: 404, metadata: {}, body: '', contentLength: 0,
          };
        }
        return {
          status: 200,
          body: new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
          contentLength: 4,
          contentType: 'application/zip',
          etag: 'old-etag',
          metadata: {
            id: 'zip-id-mno',
            version: 'old-version',
            timestamp: '1234567890',
            users: '["user@example.com"]',
            path: 'archives/data.zip',
          },
        };
      };

      const mockS3Client = {
        async send(cmd) {
          sentCommands.push(cmd);
          return { $metadata: { httpStatusCode: 200 } };
        },
      };

      const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/utils/version.js': {
          ifNoneMatch: () => mockS3Client,
          ifMatch: () => mockS3Client,
        },
      });

      const zipData = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const zipFile = new File([zipData], 'data.zip', { type: 'application/zip' });

      const env = {};
      const daCtx = {
        org: 'testorg',
        bucket: 'test-bucket',
        key: 'archives/data.zip',
        users: [{ email: 'user@example.com' }],
      };

      const update = {
        bucket: 'test-bucket',
        org: 'testorg',
        key: 'archives/data.zip',
        body: zipFile,
        contentLength: zipData.length,
        type: 'application/zip',
      };

      // FIRST CALL - no version
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);

      // SECOND CALL - still no version for binaries
      sentCommands.length = 0;
      await putObjectWithVersion(env, daCtx, update);
      assert.strictEqual(sentCommands.length, 1);
    });
  });
});
