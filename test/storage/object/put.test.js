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
import assert from 'node:assert';
import { strict as esmock } from 'esmock';

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import env from '../../utils/mocks/env.js';

import { putObjectWithVersion, postObjectVersion } from './mocks/version/put.js';

const s3Mock = mockClient(S3Client);
const putObject = await esmock('../../../src/storage/object/put.js', {
  '../../../src/storage/version/put.js': {
    putObjectWithVersion,
    postObjectVersion,
  },
});

describe('Object storage', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Put success', async () => {
    it('Successfully puts text data', async () => {
      const daCtx = {
        org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props',
      };
      const obj = { data: '<html></html>', guid: '8888' };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(resp.metadata.id, '8888');
    });

    it('Successfully puts file data', async () => {
      const daCtx = {
        org: 'adobe', site: 'geometrixx', isFile: true, key: 'geometrixx/foo.html', pathname: '/foo', propsKey: 'geometrixx/foo.html.props',
      };
      const data = new File(['foo'], 'foo.txt', { type: 'text/plain' });
      const obj = { data };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(JSON.parse(resp.body).source.editUrl, 'https://da.live/edit#/adobe/foo');
    });

    it('Successfully puts no data', async () => {
      const daCtx = {
        org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props',
      };
      const resp = await putObject(env, daCtx);
      assert.strictEqual(resp.status, 201);
    });
  });
});
