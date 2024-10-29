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

import assert from 'node:assert';
import esmock from 'esmock';
import { mockClient } from 'aws-sdk-client-mock';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const s3Mock = mockClient(S3Client);

describe('Object delete', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Single context', () => {
    it('Delete a file', async () => {
      const collabCalled = []
      const dacollab = { fetch: (u) => collabCalled.push(u) };

      const env = { dacollab };
      const daCtx = {
        origin: 'https://admin.da.live',
        org: 'testorg',
      };

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Deleted' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
        }
      );
      s3Mock
        .on(DeleteObjectCommand, { Bucket: 'testorg-content', Key: 'foo/bar.html' })
        .resolves({ $metadata: { httpStatusCode: 204 } });

      const resp = await deleteObject(s3Mock, daCtx, 'foo/bar.html', env);
      assert.equal(204, resp.status);
      assert.deepStrictEqual(['postObjectVersionWithLabel'], postObjVerCalled);
      assert.deepStrictEqual(
        ['https://localhost/api/v1/deleteadmin?doc=https://admin.da.live/source/testorg/foo/bar.html'],
        collabCalled
      );
    });

    it('Delete properties file', async () => {
      const daCtx = { org: 'testorg' };
      const env = {};

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Moved' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };
      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
        }
      );
      s3Mock
        .on(DeleteObjectCommand, { Bucket: 'testorg-content', Key: 'foo/bar.props' })
        .resolves({ $metadata: { httpStatusCode: 204 } });

      const resp = await deleteObject(s3Mock, daCtx, 'foo/bar.props', env, true);
      assert.equal(204, resp.status);
      assert.deepStrictEqual([], postObjVerCalled);
    });

    it('Move a non-doc resource', async () => {
      const daCtx = { org: 'testorg' };
      const env = {};

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Moved' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
        }
      );
      s3Mock
        .on(DeleteObjectCommand, { Bucket: 'testorg-content', Key: 'foo/aha.png' })
        .resolves({ $metadata: { httpStatusCode: 204 } });

      const resp = await deleteObject(s3Mock, daCtx, 'foo/aha.png', env, true);
      assert.equal(204, resp.status);
      assert.deepStrictEqual(['postObjectVersionWithLabel'], postObjVerCalled);
    });
  });

  describe('multiple file context', () => {
    it('Handles no continuation', async () => {
      const daCtx = {
        org: 'testorg',
        key: 'foo/bar.html',
      };
      const env = {
        dacollab: {
          fetch: () => {
          }
        },
      };
      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Deleted' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const deleteObjects = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
        }
      );
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'foo/bar.html' }] });
      s3Mock
        .on(DeleteObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 204 } });
      const resp = await deleteObjects(env, daCtx);
      assert.strictEqual(resp.status, 204);
      assert.deepStrictEqual(postObjVerCalled.length, 2);
    });

    it('Handles continuation', async () => {
      const daCtx = {
        org: 'testorg',
        key: 'foo/bar.html',
      };
      const env = {
        dacollab: {
          fetch: () => {
          }
        },
      };
      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Deleted' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const deleteObjects = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
        }
      );
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'foo/bar.html' }], NextContinuationToken: 'token' });
      s3Mock
        .on(DeleteObjectCommand)
        .resolves({ $metadata: { httpStatusCode: 204 } });
      const resp = await deleteObjects(env, daCtx);
      assert.strictEqual(resp.status, 206);
      assert.deepStrictEqual(postObjVerCalled.length, 2);
    });
  });

});
