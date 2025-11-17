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

    assert.equal(201, resp.status);
    assert(resp.metadata.id)
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
    const getObjectCalls = []
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({e, u, nb});
      return {
        status: 404,
        metadata: {}
      };
    };

    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        const resp = {
          $metadata: {
            httpStatusCode: 510
          }
        };
        throw resp;
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
    const mockCtx = { users: [{ email: 'foo@acme.com' }] };
    const resp = await putObjectWithVersion(mockEnv, mockCtx, 'haha', false);
    assert.equal(510, resp.status);
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
    const getObjectCalls = []
    const mockGetObject = async (e, u, nb) => {
      getObjectCalls.push({e, u, nb});
      return {
        status: 200,
        metadata: {}
      };
    };

    const sendCalls = [];
    const mockS3Client = {
      async send(cmd) {
        sendCalls.push(cmd);
        throw new Error('testing 123');
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
    assert.equal(500, resp.status);
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
    const daCtx= { bucket: 'bkt', org: 'myorg', ext: 'html' };
    const update = { bucket: 'bkt', body: 'new-body', org: 'myorg', key: 'a/x.html' };
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
    const daCtx= { bucket: 'bbb', org: 'myorg', ext: 'html', users: [{"email": "foo@acme.org"}, {"email": "bar@acme.org"}] };
    const update = { bucket: 'bbb', body: 'new-body', org: 'myorg', key: 'a/x.html' };
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
    assert.equal('[{\"email\":\"foo@acme.org\"},{\"email\":\"bar@acme.org\"}]', s3Sent[0].input.Metadata.Users);
    assert.notEqual('aaa-bbb', s3Sent[0].input.Metadata.Version);
    assert(s3Sent[0].input.Metadata.Timestamp > 0);
    assert((s3Sent[0].input.Metadata.Preparsingstore - s3Sent[0].input.Metadata.Timestamp) < 100);
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
    const daCtx= { bucket: 'b-b', org: 'myorg' };
    const update = { bucket: 'b-b', org: 'myorg', key: 'a/b/c' };
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
    const mockGetObject = async (e, u, h) => {
      return { metadata: { id: 'x123' }, status: 200 };
    }

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
    });

    const resp = await putObjectWithVersion({}, {}, {}, false, 'y999');
    assert.equal(409, resp.status);
  });

  it('Put First Object With ID provided', async () => {
    const mockGetObject = async (e, u, h) => {
      return { status: 404 };
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

    const update = { org: 'orgOne', key: '/root/somedoc.html' };
    const resp = await putObjectWithVersion({}, {}, update, true, 'myidAAA');
    assert.equal(201, resp.status);
    assert.equal('myidAAA', resp.metadata.id);
  });

  it('Post Object With Version creates new version', async () => {
    const req = {
      json: () => ({
        label: 'foobar'
      })
    };
    const env = {};
    const ctx = {
      bucket: 'mybucket',
      org: 'org123',
      key: 'q/r/t'
    };

    const mockGetObject = async (e, u, h) => {
      if (e === env && !h) {
        const body = ReadableStream.from('doccontent');
        return {
          body,
          contentType: 'text/html',
          contentLength: 10,
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
    const mockIfMatch = () => mockS3Client;

    const s3INMSent = [];
    const mockS3INMClient = {
      send: (c) => {
        s3INMSent.push(c);
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };
    const mockIfNoneMatch = () => mockS3INMClient;

    const { postObjectVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: mockIfMatch,
        ifNoneMatch: mockIfNoneMatch
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

    assert(s3INMSent[0].input.Body !== s3Sent[0].input.Body )
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
      }
      return { body: '', metadata, contentLength: 616 };
    };

    const sentToS3 = [];
    const s3Client = {
      send: async (c) => {
        sentToS3.push(c);
        return {
          $metadata: {
            httpStatusCode: 201
          }
        };
      }
    };
    const mockS3Client = () => s3Client;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client
      },
    });

    const resp = await putObjectWithVersion({}, { method: 'HEAD' }, {});
    assert.equal(1, sentToS3.length);
    const input = sentToS3[0].input;
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
      }
      return { body: 'Somebody...', metadata, contentLength: 616 };
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

    const sentToS3_2 = [];
    const s3Client2 = {
      send: async (c) => {
        sentToS3_2.push(c);
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };
    const mockS3Client2 = () => s3Client2;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
        ifMatch: mockS3Client2
      },
    });

    const update = {
      org: 'o1',
      body: 'foobar',
      key: 'mypath',
      type: 'test/plain',
    }
    const ctx = {
      org: 'o1',
      users: [{ email: 'hi@acme.com' }]
    }
    const resp = await putObjectWithVersion({}, ctx, update, true);
    assert.equal(1, sentToS3.length);
    const input = sentToS3[0].input;
    assert.equal('Somebody...', input.Body);
    assert.equal(616, input.ContentLength);
    assert.equal('/qwerty', input.Metadata.Path);
    assert.equal(1234, input.Metadata.Timestamp);
    assert.equal('[{"email":"anonymous"}]', input.Metadata.Users);

    assert.equal(1, sentToS3_2.length);
    const input2 = sentToS3_2[0].input;
    assert.equal('foobar', input2.Body);
    assert.equal(6, input2.ContentLength);
    assert.equal('test/plain', input2.ContentType);
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
      }
      return { body: 'Somebody...', metadata, contentLength: 616 };
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

    const sentToS3_2 = [];
    const s3Client2 = {
      send: async (c) => {
        sentToS3_2.push(c);
        return {
          $metadata: {
            httpStatusCode: 200
          }
        };
      }
    };
    const mockS3Client2 = () => s3Client2;

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
        ifMatch: mockS3Client2
      },
    });

    const update = {
      org: 'o1',
      body: '',
      key: 'mypath',
      type: 'test/plain',
    }
    const ctx = {
      org: 'o1',
      users: [{ email: 'hi@acme.com' }],
      method: 'PUT',
      ext: 'html',
    }

    const resp = await putObjectWithVersion({}, ctx, update, true);

    assert.equal(1, sentToS3.length);
    const input = sentToS3[0].input;

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
    assert.equal('test/plain', input2.ContentType);
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
      }
    };
    const s3client2 = {
      send: async (c) => {
        throw new Error('Test error2');
      }
    };
    const s3client3 = {
      send: async (c) => {
        const e = new Error('Test error3');
        e.$metadata = {};
        throw e;
      }
    };
    let s3Client = null;
    const mockS3Client = () => s3Client;

    const { putVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: mockS3Client,
      },
    });

    s3Client = s3client1;
    const resp = await putVersion({}, { Body: 'hello'});
    assert.equal(418, resp.status);
    s3Client = s3client2;
    const resp2 = await putVersion({}, { Body: 'hello'});
    assert.equal(500, resp2.status);
    s3Client = s3client3;
    const resp3 = await putVersion({}, { Body: 'hello'});
    assert.equal(500, resp3.status);
  });

  it('Test putVersion preserves ContentType', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 }
        };
      }
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
      ContentType: 'text/html'
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
          $metadata: { httpStatusCode: 200 }
        };
      }
    };

    const mockGetObject = async () => ({
      status: 200,
      body: 'test body',
      contentLength: 9,
      contentType: 'text/plain',
      metadata: { existing: 'metadata' }
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifNoneMatch: () => mockS3Client,
        generateId: () => 'generated-id',
        generateVersion: () => 'generated-version'
      },
    });

    const env = {};
    const daCtx = {
      org: 'test-org',
      ext: 'txt',
      users: [{ email: 'test@example.com' }]
    };

    await putObjectWithVersion(env, daCtx, { key: 'test-file.txt' }, 'test body', 'test-guid');

    assert.strictEqual(sentCommands.length, 1);
    const putCommand = sentCommands[0];
    assert.strictEqual(putCommand.input.ContentType, 'text/plain');
    assert.strictEqual(putCommand.input.Body, 'test body');
    assert.strictEqual(putCommand.input.ContentLength, 9);
  });

  it('Test NO Collab Parse version - preparsingstore behavior removed', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 }
        };
      }
    };

    const mockGetObject = async () => ({
      status: 200,
      body: '<html><body>Existing content</body></html>',
      contentLength: 42,
      contentType: 'text/html',
      etag: 'existing-etag',
      metadata: {
        id: 'doc-123',
        version: 'v1',
        timestamp: '1234567890',
        users: '[{"email":"user@example.com"}]',
        path: 'docs/page.html',
        preparsingstore: '0' // No longer triggers special behavior
      }
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3Client,
      },
    });

    const env = {};
    const daCtx = {
      org: 'test-org',
      bucket: 'test-bucket',
      key: 'docs/page.html',
      ext: 'html',
      method: 'PUT',
      users: [{ email: 'user@example.com' }]
    };

    // Call without body parameter
    await putObjectWithVersion(env, daCtx, {
      bucket: 'test-bucket',
      org: 'test-org',
      key: 'docs/page.html',
      type: 'text/html'
    });

    // Should have 2 commands: putVersion + putObject
    assert.strictEqual(sentCommands.length, 2);

    // First command should be putVersion with empty body (no Collab Parse)
    const versionCommand = sentCommands[0];
    assert.strictEqual(versionCommand.input.Key, 'test-org/.da-versions/doc-123/v1.html');
    assert.strictEqual(versionCommand.input.Body, ''); // Empty - no Collab Parse
    assert.ok(versionCommand.input.ContentLength === undefined || versionCommand.input.ContentLength === 0);
    
    // Second command should be putObject updating the main file
    const updateCommand = sentCommands[1];
    assert.strictEqual(updateCommand.input.Key, 'test-org/docs/page.html');
    // Preparsingstore should preserve the existing value
    assert.strictEqual(updateCommand.input.Metadata.Preparsingstore, '0');
  });

  it('Test preparsingstore defaults to 0 when undefined', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 }
        };
      }
    };

    const mockGetObject = async () => ({
      status: 200,
      body: '<html><body>Existing content</body></html>',
      contentLength: 42,
      contentType: 'text/html',
      etag: 'existing-etag',
      metadata: {
        id: 'doc-456',
        version: 'v2',
        timestamp: '1234567890',
        users: '[{"email":"user@example.com"}]',
        path: 'docs/page2.html'
        // preparsingstore is undefined - defaults to '0'
      }
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3Client,
      },
    });

    const env = {};
    const daCtx = {
      org: 'test-org',
      bucket: 'test-bucket',
      key: 'docs/page2.html',
      ext: 'html',
      method: 'PUT',
      users: [{ email: 'user@example.com' }]
    };

    // Call without body parameter
    await putObjectWithVersion(env, daCtx, {
      bucket: 'test-bucket',
      org: 'test-org',
      key: 'docs/page2.html',
      type: 'text/html'
    });

    // Should have 2 commands: putVersion + putObject
    assert.strictEqual(sentCommands.length, 2);

    // First command should be putVersion with empty body
    const versionCommand = sentCommands[0];
    assert.strictEqual(versionCommand.input.Key, 'test-org/.da-versions/doc-456/v2.html');
    assert.strictEqual(versionCommand.input.Body, ''); // Empty - no body stored
    
    // Second command - preparsingstore should default to '0'
    const updateCommand = sentCommands[1];
    assert.strictEqual(updateCommand.input.Metadata.Preparsingstore, '0');
  });

  it('Test preparsingstore preserves existing value when set', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 }
        };
      }
    };

    const mockGetObject = async () => ({
      status: 200,
      body: '<html><body>Existing content</body></html>',
      contentLength: 42,
      contentType: 'text/html',
      etag: 'existing-etag',
      metadata: {
        id: 'doc-789',
        version: 'v3',
        timestamp: '1234567890',
        users: '[{"email":"user@example.com"}]',
        path: 'docs/page3.html',
        preparsingstore: '1700000000000' // Already set - should be preserved
      }
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3Client,
      },
    });

    const env = {};
    const daCtx = {
      org: 'test-org',
      bucket: 'test-bucket',
      key: 'docs/page3.html',
      ext: 'html',
      method: 'PUT',
      users: [{ email: 'user@example.com' }]
    };

    // Call without body parameter
    await putObjectWithVersion(env, daCtx, {
      bucket: 'test-bucket',
      org: 'test-org',
      key: 'docs/page3.html',
      type: 'text/html'
    });

    // Should have 2 commands: putVersion (with empty body) + putObject
    assert.strictEqual(sentCommands.length, 2);

    // First command should be putVersion with empty Body
    const versionCommand = sentCommands[0];
    assert.strictEqual(versionCommand.input.Key, 'test-org/.da-versions/doc-789/v3.html');
    assert.strictEqual(versionCommand.input.Body, ''); // Empty - no body stored
    // ContentLength can be undefined or 0 for empty body
    assert.ok(versionCommand.input.ContentLength === undefined || versionCommand.input.ContentLength === 0);
    
    // Second command should preserve the existing preparsingstore value
    const updateCommand = sentCommands[1];
    assert.strictEqual(updateCommand.input.Metadata.Preparsingstore, '1700000000000');
  });

  it('Test version stores body when body parameter is provided', async () => {
    const sentCommands = [];
    const mockS3Client = {
      async send(cmd) {
        sentCommands.push(cmd);
        return {
          $metadata: { httpStatusCode: 200 }
        };
      }
    };

    const mockGetObject = async () => ({
      status: 200,
      body: '<html><body>Old content</body></html>',
      contentLength: 36,
      contentType: 'text/html',
      etag: 'existing-etag',
      metadata: {
        id: 'doc-abc',
        version: 'v4',
        timestamp: '1234567890',
        users: '[{"email":"user@example.com"}]',
        path: 'docs/page4.html',
        preparsingstore: '0'
      }
    });

    const { putObjectWithVersion } = await esmock('../../../src/storage/version/put.js', {
      '../../../src/storage/object/get.js': {
        default: mockGetObject
      },
      '../../../src/storage/utils/version.js': {
        ifMatch: () => mockS3Client,
        ifNoneMatch: () => mockS3Client,
      },
    });

    const env = {};
    const daCtx = {
      org: 'test-org',
      bucket: 'test-bucket',
      key: 'docs/page4.html',
      ext: 'html',
      method: 'PUT',
      users: [{ email: 'user@example.com' }]
    };

    // Call WITH body parameter
    await putObjectWithVersion(env, daCtx, {
      bucket: 'test-bucket',
      org: 'test-org',
      key: 'docs/page4.html',
      body: '<html><body>New content</body></html>',
      type: 'text/html'
    }, true); // body parameter is true

    // Should have 2 commands: putVersion + putObject
    assert.strictEqual(sentCommands.length, 2);

    // First command should be putVersion with the OLD body content
    const versionCommand = sentCommands[0];
    assert.strictEqual(versionCommand.input.Key, 'test-org/.da-versions/doc-abc/v4.html');
    assert.strictEqual(versionCommand.input.Body, '<html><body>Old content</body></html>');
    assert.strictEqual(versionCommand.input.ContentLength, 36);
  });
});
