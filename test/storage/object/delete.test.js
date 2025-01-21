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
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Mock = mockClient(S3Client);


describe('Object delete', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('single context', () => {
    it('Delete a file', async () => {
      const collabCalled = []
      const dacollab = { fetch: (u) => collabCalled.push(u) };

      const client = {};
      const env = { dacollab };
      const daCtx = {
        origin: 'https://admin.da.live',
        org: 'testorg',
      };

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Deleted' && e === env && c.key === 'foo/bar.html' && c.org === 'testorg') {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const deleteURL = 'https://localhost:9876/foo/bar.html';
      const mockSignedUrl = async (cl, cm) => {
        if (cl === client
          && cm.constructor.toString().includes('DeleteObjectCommand')) {
          return deleteURL;
        }
      };

      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: mockSignedUrl,
          }
        }
      );

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, opts) => {
          assert.equal(deleteURL, url);
          assert.equal('DELETE', opts.method);
          return { status: 204 };
        };

        const resp = await deleteObject(client, daCtx, 'foo/bar.html', env);
        assert.equal(204, resp.status);
        // assert.deepStrictEqual(['postObjectVersionWithLabel'], postObjVerCalled);
        // assert.deepStrictEqual(
        //   ['https://localhost/api/v1/deleteadmin?doc=https://admin.da.live/source/testorg/foo/bar.html'],
        //   collabCalled
        // );
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('Delete dir', async () => {
      const client = {};
      const daCtx = {};
      const env = {};

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Moved' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const deleteURL = 'https://localhost:9876/a/b/c/d';
      const mockSignedUrl = async (cl, cm) => {
        if (cl === client
          && cm.constructor.toString().includes('DeleteObjectCommand')) {
          return deleteURL;
        }
      };

      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: mockSignedUrl,
          }
        }
      );

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, opts) => {
          assert.equal(deleteURL, url);
          assert.equal('DELETE', opts.method);
          return { status: 204 };
        };

        const resp = await deleteObject(client, daCtx, 'd', env, true);
        assert.equal(204, resp.status);
        assert.deepStrictEqual([], postObjVerCalled);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('Delete properties file', async () => {
      const client = {};
      const daCtx = {};
      const env = {};

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Moved' && e === env && c === daCtx) {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const deleteURL = 'https://localhost:9876/a/b/c/d.props';
      const mockSignedUrl = async (cl, cm) => {
        if (cl === client
          && cm.constructor.toString().includes('DeleteObjectCommand')) {
          return deleteURL;
        }
      };

      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: mockSignedUrl,
          }
        }
      );

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, opts) => {
          assert.equal(deleteURL, url);
          assert.equal('DELETE', opts.method);
          return { status: 204 };
        };

        const resp = await deleteObject(client, daCtx, 'd.props', env, true);
        assert.equal(204, resp.status);
        assert.deepStrictEqual([], postObjVerCalled);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('Move a non-doc resource', async () => {
      const client = {};
      const daCtx = {};
      const env = {};

      const postObjVerCalled = [];
      const mockPostObjectVersion = async (l, e, c) => {
        if (l === 'Moved' && e === env && c.key === 'aha.png') {
          postObjVerCalled.push('postObjectVersionWithLabel');
          return { status: 201 };
        }
      };

      const deleteURL = 'https://localhost:9876/aha.png';
      const mockSignedUrl = async (cl, cm) => {
        if (cl === client
          && cm.constructor.toString().includes('DeleteObjectCommand')) {
          return deleteURL;
        }
      };

      const { deleteObject } = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: mockSignedUrl,
          }
        }
      );

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, opts) => {
          assert.equal(deleteURL, url);
          assert.equal('DELETE', opts.method);
          return { status: 204 };
        };

        const resp = await deleteObject(client, daCtx, 'aha.png', env, true);
        assert.equal(204, resp.status);
        // assert.deepStrictEqual(['postObjectVersionWithLabel'], postObjVerCalled);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });
  });

  describe('multiple files context', () => {
    it('Handles no continuation', async () => {
      const daCtx = {
        org: 'testorg',
        key: 'foo/bar.html',
        aclCtx: { pathLookup: new Map() },
      };
      const env = {
        dacollab: {
          fetch: () => {
          }
        },
      };
      const mockPostObjectVersion = async () => ({ status: 201 });
      const mockSignedUrl = async () => 'http://localhost:8080/test/';
      const deleteObjects = await esmock(
        '../../../src/storage/object/delete.js',
        {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: mockSignedUrl,
          }
        },
        {
          import: {
            fetch: async () => ({ status: 200 }),
          }
        }
      );
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'foo/bar.html' }] });
      const resp = await deleteObjects(env, daCtx, {});
      assert.strictEqual(resp.status, 204);
    });

    it('Handles continuation', async () => {
      const daCtx = {
        org: 'testorg',
        key: 'foo/bar.html',
        aclCtx: { pathLookup: new Map() },
      };
      const env = {
        dacollab: {
          fetch: () => {
          }
        },
      };
      const mockPostObjectVersion = async () => ({ status: 201 });
      const mockSignedUrl = async () => 'http://localhost:8080/test/';
      const deleteObjects = await esmock(
        '../../../src/storage/object/delete.js',
        {
          '../../../src/storage/version/put.js': {
            postObjectVersionWithLabel: mockPostObjectVersion,
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl: mockSignedUrl,
          }
        },
        {
          import: {
            fetch: async () => ({ status: 200 }),
          }
        }
      );
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'foo/bar.html' }], NextContinuationToken: 'token' });
      const resp = await deleteObjects(env, daCtx, {});
      assert.strictEqual(resp.status, 206);
    });

    it('Delete permissions', async () => {
      const listCommand = () => {
        return {
          sourceKeys: [ 'a', 'b', 'c']
        }
      };
      const getSignedUrl = (c, dc) => {
        return dc.input.Key;
      }
      const mockS3Client = class {};

      const deleteObjects = await esmock(
        '../../../src/storage/object/delete.js', {
          '../../../src/storage/utils/list.js': {
            listCommand
          },
          '@aws-sdk/client-s3': {
            S3Client: mockS3Client
          },
          '@aws-sdk/s3-request-presigner': {
            getSignedUrl
          }
        }
      );

      const pathLookup = new Map();
      pathLookup.set('harry@foo.org', [
        { path: '/a', actions: [] },
        { path: '/b', actions: ['read'] },
        { path: '/c', actions: ['read', 'write'] },
      ]);
      const aclCtx = { pathLookup };
      const users = [{ email: 'harry@foo.org' }];
      const ctx = { aclCtx, users, key: 'notused' };

      const fetchURLs = [];
      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url) => {
          fetchURLs.push(url);
          return { status: 200 };
        };

        const resp = await deleteObjects({}, ctx, {});
        assert.strictEqual(resp.status, 204);
      } finally {
        globalThis.fetch = savedFetch;
      }
      assert.deepStrictEqual(['c'], fetchURLs);
    });
  });
});
