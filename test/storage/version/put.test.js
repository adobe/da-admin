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

import { getContentLength } from '../../../src/storage/version/put.js';
import { ifMatch } from '../../../src/storage/utils/version.js';

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
      return { metadata, contentLength: 42 };
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
    assert.equal(42, input.ContentLength);
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

  it('Test getContentLength String', () => {
    const length = getContentLength('hello');
    assert.equal(5, length);
  });

  it('Test getContentLength Unicode String', () => {
    const length = getContentLength('🥳');
    assert.equal(4, length);
  });

  it('Test getContentLength with unknown', () => {
    const body = {};
    const length = getContentLength(body);
    assert.equal(undefined, length);
  });

  it('Test getContentLength with undefined', () => {
    const length = getContentLength(undefined);
    assert.equal(undefined, length);
  });

  it('Test getContentLength with File', () => {
    const body = new File(['Some File Content'], 'foo.txt', { type: 'text/plain' });
    const length = getContentLength(body);
    assert.equal(17, length);
  });

  it('Test putObjectWithVersion HEAD', async () => {
    const mockGetObject = async () => {
      const metadata = {
        id: 'idabc',
        version: '101',
        path: '/q',
        timestamp: 123,
        users: '[{"email":"anonymous"}]',
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

    const resp = await putObjectWithVersion({}, {}, {});
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
      body: 'foobar',
      key: '/mypath',
      type: 'test/plain',
    }
    const ctx = {
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
    assert.equal('/mypath', input2.Key);
    assert.equal('/mypath', input2.Metadata.Path);
    assert.equal('[{"email":"hi@acme.com"}]', input2.Metadata.Users);
    assert(input2.Metadata.Version && input2.Metadata.Version !== 101);
  });
});
