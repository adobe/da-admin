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

describe('Version Patch', () => {
  it('Patch Object unknown', async () => {
    const req = { json: async () => JSON.parse('{"label": "Some version"}')};
    const { patchObjectVersion } = await esmock(
      '../../../src/storage/version/patch.js', {
        '../../../src/storage/object/get.js': {
          default: () => ({ status: 404 }),
        }
    });

    const daCtx = {
      org: 'org1',
      key: 'mykey',
    };

    const resp = await patchObjectVersion(req, {}, daCtx);
    assert.equal(404, resp.status);
  })

  it('Patch Object Version', async () => {
    const req = { json: async () => JSON.parse('{}')};
    const env = {
      S3_DEF_URL: 's3def',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret'
    };
    const daCtx = {
      org: 'org1',
      key: 'mykey',
      site: 'site1',
      name: 'cafe1234',
      ext: 'html'
    };

    const mockS3Client = class S3Client {
      constructor(arg) {
        this.arg = arg;
      }
    };

    const mockedObject = {
      body: 'obj body',
      metadata: { timestamp: '999', label: 'prev label' }
    };
    const mockGetObject = async (e, c) => {
      if (e === env
        && c.org === 'org1'
        && c.key === '.da-versions/mykey' ) {
          return mockedObject;
        } else {
          assert.fail('Unexpected arguments passed to getObject()');
        }
    };

    const pvCalled = [];
    const mockPutVersion = (c, d, e) => {
      pvCalled.push(c, d, e);
      return { status: 200 };
    }

    const { patchObjectVersion } = await esmock(
      '../../../src/storage/version/patch.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/version/put.js': {
          putVersion: mockPutVersion
        }
    });

    const resp = await patchObjectVersion(req, env, daCtx);
    const pe = pvCalled[0];
    assert.equal('auto', pe.region);
    assert.equal('s3def', pe.endpoint);
    assert.equal('id', pe.credentials.accessKeyId);
    assert.equal('secret', pe.credentials.secretAccessKey);
    assert(!pvCalled[2]);

    // Check the data sent to putVersion
    const de = pvCalled[1];
    assert.equal('org1-content', de.Bucket);
    assert.equal('obj body', de.Body);
    assert.equal('site1', de.ID);
    assert.equal('cafe1234', de.Version);
    assert.equal('html', de.Ext);
    assert.equal('[{"email":"anonymous"}]', de.Metadata.Users);
    assert.equal('999', de.Metadata.Timestamp);
    assert.equal('mykey', de.Metadata.Path);
    assert.equal('prev label', de.Metadata.Label);
    assert.equal(200, resp.status);
  });

  it('Patch Object Version 2', async () => {
    const req = { json: async () => JSON.parse('{"label": "v999"}')};
    const env = {};
    const daCtx = {
      org: 'org2',
      key: 'some/key',
      site: 'site1',
      name: 'cafe1234',
      ext: 'html'
    };

    const mockS3Client = class S3Client {
      constructor(arg) {
        this.arg = arg;
      }
    };

    const mockedObject = {
      body: 'obj body',
      metadata: {
        timestamp: '12345',
        users: '[{"email":"jbloggs@acme"},{"email":"ablah@halba"}]',
        path: 'goobar'
      }
    };
    const mockGetObject = async (e, c) => {
      if (e === env
        && c.org === 'org2'
        && c.key === '.da-versions/some/key' ) {
          return mockedObject;
        } else {
          assert.fail('Unexpected arguments passed to getObject()');
        }
    };

    const pvCalled = [];
    const mockPutVersion = (c, d, e) => {
      pvCalled.push(c, d, e);
      return { status: 200 };
    }

    const { patchObjectVersion } = await esmock(
      '../../../src/storage/version/patch.js', {
        '../../../src/storage/object/get.js': {
          default: mockGetObject,
        },
        '../../../src/storage/version/put.js': {
          putVersion: mockPutVersion
        }
    });

    const resp = await patchObjectVersion(req, env, daCtx);

    // Check the data sent to putVersion
    const de = pvCalled[1];
    assert.equal('org2-content', de.Bucket);
    assert.equal('obj body', de.Body);
    assert.equal('site1', de.ID);
    assert.equal('cafe1234', de.Version);
    assert.equal('html', de.Ext);
    assert.equal('[{"email":"jbloggs@acme"},{"email":"ablah@halba"}]', de.Metadata.Users);
    assert.equal('12345', de.Metadata.Timestamp);
    assert.equal('goobar', de.Metadata.Path);
    assert.equal('v999', de.Metadata.Label);
    assert.equal(200, resp.status);
  });
});