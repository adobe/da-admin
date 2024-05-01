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
  it('Put Object Version 2', async () => {
    const mockGetObject = async () => {
      const metadata = {
        displayname: 'old displayname',
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

    const dn = { displayname: 'my display name' };
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
    assert.equal('old displayname', input.Metadata.Displayname);
    assert.equal(999, input.Metadata.Timestamp);
    assert.equal('/y/z', input.Metadata.Path);
  });

  it('Put Object Version', async () => {
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

    const dn = { displayname: 'my display name' };
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
    assert.equal('my display name', input.Metadata.Displayname);
    assert(input.Metadata.Timestamp > (Date.now() - 2000)); // Less than 2 seconds old
    assert.equal('/a/b/c', input.Metadata.Path);
  });
});
