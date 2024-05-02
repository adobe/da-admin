import assert from 'assert';
import { strict as esmock } from 'esmock';

import env from '../../utils/mocks/env.js';

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';

const s3Mock = mockClient(S3Client);

import { putObjectWithVersion, postObjectVersion } from './mocks/version/put.js';
const putObject = await esmock('../../../src/storage/object/put.js', {
  '../../../src/storage/version/put.js': {
    putObjectWithVersion,
    postObjectVersion,
  }
});

describe('Object storage', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Put success', async () => {
    it('Successfully puts text data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props' };
      const obj = { data: '<html></html>' };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
    });

    it('Successfully puts file data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', isFile: true, key: 'geometrixx/foo.html', pathname: '/foo', propsKey: 'geometrixx/foo.html.props' };
      const data = new File(['foo'], 'foo.txt', { type: 'text/plain' });
      const obj = { data };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(JSON.parse(resp.body).source.editUrl, 'https://da.live/edit#/adobe/foo')
    });

    it('Successfully puts no data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props' };
      const resp = await putObject(env, daCtx);
      assert.strictEqual(resp.status, 201);
    });
  });
});
