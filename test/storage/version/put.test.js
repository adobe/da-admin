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
import assert from 'assert';
import esmock from 'esmock';

describe('Version Put', () => {
  it('Post Object Version', async () => {
    const mockGetObject = async () => {
      const metadata = {
        id: 'id',
        version: '123'
      }
      return { metadata };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };
    const mockS3Client = () => s3Client;

    const { postObjectVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        createBucketIfMissing: mockS3Client
      },
    });

    const dn = { label: 'my label' };
    const req = {
      json: async () => dn
    };
    const env = {};
    const daCtx = {
      org: 'myorg',
      key: '/a/b/c',
      ext: 'html'
    };

    const resp = await postObjectVersion(req, env, daCtx);
    assert.equal(201, resp.status);

    assert.equal(1, sentToS3.length);
    const input = sentToS3[0].input;
    assert.equal('myorg-content', input.Bucket);
    assert.equal('.da-versions/id/123.html', input.Key);
    assert.equal('[{"email":"anonymous"}]', input.Metadata.Users);
    assert.equal('my label', input.Metadata.Label);
    assert(input.Metadata.Timestamp > (Date.now() - 2000)); // Less than 2 seconds old
    assert.equal('/a/b/c', input.Metadata.Path);
  });

  it('Post Object Version 2', async () => {
    const mockGetObject = async () => {
      const metadata = {
        label: 'old label',
        id: 'idx',
        version: '456',
        path: '/y/z',
        timestamp: 999,
        users: '[{"email":"foo@acme.org"}]',
      }
      return { metadata };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 202
          }
        };
      }
    };
    const mockS3Client = () => s3Client;

    const { postObjectVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        createBucketIfMissing: mockS3Client
      },
    });

    const dn = { label: 'my label' };
    const req = {};
    const env = {};
    const daCtx = {
      org: 'someorg',
      key: '/a/b/c',
      ext: 'html'
    };

    const resp = await postObjectVersion(req, env, daCtx);
    assert.equal(202, resp.status);

    assert.equal(1, sentToS3.length);
    const input = sentToS3[0].input;
    assert.equal('someorg-content', input.Bucket);
    assert.equal('.da-versions/idx/456.html', input.Key);
    assert.equal('[{"email":"foo@acme.org"}]', input.Metadata.Users);
    assert.equal('old label', input.Metadata.Label);
    assert.equal(999, input.Metadata.Timestamp);
    assert.equal('/y/z', input.Metadata.Path);
  });

  it('Post Object Version where Label already exists', async () => {
    const mockGetObject = async (e, x) => {
      if (x.key === '.da-versions/idx/456.myext') {
        const mdver = {
          label: 'existing label',
        };
        return { metadata: mdver };
      }
      const metadata = {
        id: 'idx',
        version: '456',
        path: '/y/z',
        timestamp: 999,
        users: '[{"email":"one@acme.org"},{"email":"two@acme.org"}]',
      }
      return { metadata };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };
    const mockS3Client = () => s3Client;

    const { postObjectVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        createBucketIfMissing: mockS3Client
      },
    });

    const dn = { label: 'my label' };
    const req = {};
    const env = {};
    const daCtx = {
      org: 'someorg',
      key: '/a/b/c',
      ext: 'myext'
    };

    const resp = await postObjectVersion(req, env, daCtx);
    assert.equal(201, resp.status);

    assert.equal(1, sentToS3.length);
    const input = sentToS3[0].input;
    assert.equal('someorg-content', input.Bucket);
    assert.equal('.da-versions/idx/456.myext', input.Key);
    assert.equal('[{"email":"one@acme.org"},{"email":"two@acme.org"}]', input.Metadata.Users);
    assert.equal('existing label', input.Metadata.Label);
    assert.equal('/y/z', input.Metadata.Path);
  });

  it('Test putObjectWithVersion retry on new document', async () => {
    const getObjectCalls = []
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({e, u, nb});
      return {
        status: 404,
        metadata: {}
      };
    };

    let firstCall = true;
    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        const resp = {
          $metadata: {
            httpStatusCode: firstCall ? 412 : 200
          }
        };
        if (firstCall) {
          firstCall = false;
          throw resp;
        } else {
          return resp;
        }
      }
    };

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client
      },
    });

    const mockEnv = { foo: 'bar' };
    const mockUpdate = 'haha';
    const mockCtx = { users: [{ email: 'foo@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, mockUpdate, false);

    assert.equal(201, resp);
    assert.equal(2, getObjectCalls.length);
    assert.equal(getObjectCalls[0].e, mockEnv);
    assert.equal(getObjectCalls[0].u, mockUpdate);
    assert.equal(getObjectCalls[0].nb, true);
    assert.equal(getObjectCalls[1].e, mockEnv);
    assert.equal(getObjectCalls[1].u, mockUpdate);
    assert.equal(getObjectCalls[1].nb, true);

    assert.equal(2, sendCalls.length);
    assert.strictEqual(sendCalls[0].input.Metadata.Users, JSON.stringify(mockCtx.users));
    assert.strictEqual(sendCalls[1].input.Metadata.Users, JSON.stringify(mockCtx.users));
  });

  it('Test putObjectWithVersion retry on existing document', async () => {
    const getObjectCalls = []
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({e, u, nb});
      return {
        status: 200,
        metadata: {}
      };
    };

    let firstCall = true;
    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        const resp = {
          $metadata: {
            httpStatusCode: firstCall ? 412 : 200
          }
        };
        if (firstCall) {
          firstCall = false;
          throw resp;
        } else {
          return resp;
        }
      }
    };
    const mockS3PutClient = {
      async send(cmd) {
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3PutClient
      },
    });

    const mockEnv = { hi: 'ha' };
    const mockUpdate = 'hoho';
    const mockCtx = { users: [{ email: 'blah@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, mockUpdate, true);

    assert.equal(200, resp);
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

  it('Put Object With Version store content', async () => {
    const mockGetObject = async (e, u, h) => {
      if (!h) {
        return {
          body: 'prevbody',
          metadata: {
            id: 'x123',
            version: 'aaa-bbb',
          },
          status: 200
        };
      }
    }

    const s3VersionSent = [];
    const mockS3VersionClient = {
      send: (c) => {
        s3VersionSent.push(c);
        return { $metadata: { httpStatusCode: 200 } };
      }
    };
    const mockIfNoneMatch = () => mockS3VersionClient;

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return { $metadata: { httpStatusCode: 200 } };
      }
    };
    const mockIfMatch = () => mockS3Client

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch,
        ifMatch: mockIfMatch,
      },
    });

    const env = {};
    const daCtx= { ext: 'html' };
    const update = { body: 'new-body', org: 'myorg', key: '/a/x.html' };
    const resp = await putObjectWithVersion(env, daCtx, update, true);
    assert.equal(200, resp);
    assert.equal(1, s3VersionSent.length);
    assert.equal('prevbody', s3VersionSent[0].input.Body);
    assert.equal('myorg-content', s3VersionSent[0].input.Bucket);
    assert.equal('.da-versions/x123/aaa-bbb.html', s3VersionSent[0].input.Key);
    assert.equal('[{"email":"anonymous"}]', s3VersionSent[0].input.Metadata.Users);
    assert.equal('/a/x.html', s3VersionSent[0].input.Metadata.Path);
    assert(s3VersionSent[0].input.Metadata.Timestamp > 0);

    assert.equal(1, s3Sent.length);
    assert.equal('new-body', s3Sent[0].input.Body);
    assert.equal('myorg-content', s3Sent[0].input.Bucket);
    assert.equal('/a/x.html', s3Sent[0].input.Key);
    assert.equal('x123', s3Sent[0].input.Metadata.ID);
    assert.equal('/a/x.html', s3Sent[0].input.Metadata.Path);
    assert.notEqual('aaa-bbb', s3Sent[0].input.Metadata.Version);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert.equal(s3Sent[0].input.Metadata.Preparsingstore, s3Sent[0].input.Metadata.Timestamp);
  });

  it('Put Object With Version don\'t store content', async () => {
    const mockGetObject = async (e, u, h) => {
      if (!h) {
        return {
          body: 'prevbody',
          metadata: {
            id: 'q123-456',
            preparsingstore: Date.now(),
            version: 'ver123',
          },
          status: 201
        };
      }
    }

    const s3VersionSent = [];
    const mockS3VersionClient = {
      send: (c) => {
        s3VersionSent.push(c);
        return { $metadata: { httpStatusCode: 200 } };
      }
    };
    const mockIfNoneMatch = () => mockS3VersionClient;

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return { $metadata: { httpStatusCode: 202 } };
      }
    };
    const mockIfMatch = () => mockS3Client

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch,
        ifMatch: mockIfMatch,
      },
    });

    const env = {};
    const daCtx= { ext: 'html', users: [{"email": "foo@acme.org"}, {"email": "bar@acme.org"}] };
    const update = { body: 'new-body', org: 'myorg', key: '/a/x.html' };
    const resp = await putObjectWithVersion(env, daCtx, update, true);
    assert.equal(202, resp);
    assert.equal(1, s3VersionSent.length);
    assert.equal('', s3VersionSent[0].input.Body);
    assert.equal('myorg-content', s3VersionSent[0].input.Bucket);
    assert.equal('.da-versions/q123-456/ver123.html', s3VersionSent[0].input.Key);
    assert.equal('[{"email":"anonymous"}]', s3VersionSent[0].input.Metadata.Users);
    assert.equal('/a/x.html', s3VersionSent[0].input.Metadata.Path);
    assert(s3VersionSent[0].input.Metadata.Timestamp > 0);

    assert.equal(1, s3Sent.length);
    assert.equal('new-body', s3Sent[0].input.Body);
    assert.equal('myorg-content', s3Sent[0].input.Bucket);
    assert.equal('/a/x.html', s3Sent[0].input.Key);
    assert.equal('q123-456', s3Sent[0].input.Metadata.ID);
    assert.equal('/a/x.html', s3Sent[0].input.Metadata.Path);
    assert.equal('[{\"email\":\"foo@acme.org\"},{\"email\":\"bar@acme.org\"}]', s3Sent[0].input.Metadata.Users);
    assert.notEqual('aaa-bbb', s3Sent[0].input.Metadata.Version);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert.equal(s3Sent[0].input.Metadata.Preparsingstore, s3Sent[0].input.Metadata.Timestamp);
  });

  it('Put First Object With Version', async () => {
    const mockGetObject = async (e, u, h) => {
      if (!h) {
        return {
          status: 404
        };
      }
    }

    const s3Sent = [];
    const mockS3Client = {
      send: (c) => {
        s3Sent.push(c);
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };
    const mockIfNoneMatch = () => mockS3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockIfNoneMatch
      },
    });

    const env = {};
    const daCtx= {};
    const update = { org: 'myorg', key: '/a/b/c' };
    const resp = await putObjectWithVersion(env, daCtx, update, true);
    assert.equal(201, resp);

    assert.equal(1, s3Sent.length);
    assert.equal('myorg-content', s3Sent[0].input.Bucket);
    assert(s3Sent[0].input.Metadata.ID);
    assert.equal('/a/b/c', s3Sent[0].input.Metadata.Path);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert(s3Sent[0].input.Metadata.Version);
  });
});
