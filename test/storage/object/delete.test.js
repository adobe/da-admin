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

describe('Object delete', () => {
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
      if (l === 'Deleted' && e === env && c === daCtx) {
        postObjVerCalled.push('postObjectVersionWithLabel');
        return {status: 201};
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
        return {status: 204};
      };

      const resp = await deleteObject(client, daCtx, 'foo/bar.html', env);
      assert.equal(204, resp.status);
      assert.deepStrictEqual(['postObjectVersionWithLabel'], postObjVerCalled);
      assert.deepStrictEqual(
        ['https://localhost/api/v1/deleteadmin?doc=https://admin.da.live/source/testorg/foo/bar.html'],
        collabCalled
      );
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Delete dir', async() => {
    const client = {};
    const daCtx = {};
    const env = {};

    const postObjVerCalled = [];
    const mockPostObjectVersion = async (l, e, c) => {
      if (l === 'Moved' && e === env && c === daCtx) {
        postObjVerCalled.push('postObjectVersionWithLabel');
        return {status: 201};
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
        return {status: 204};
      };

      const resp = await deleteObject(client, daCtx, 'd', env, true);
      assert.equal(204, resp.status);
      assert.deepStrictEqual([], postObjVerCalled);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('Delete properties file', async() => {
    const client = {};
    const daCtx = {};
    const env = {};

    const postObjVerCalled = [];
    const mockPostObjectVersion = async (l, e, c) => {
      if (l === 'Moved' && e === env && c === daCtx) {
        postObjVerCalled.push('postObjectVersionWithLabel');
        return {status: 201};
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
        return {status: 204};
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
      if (l === 'Moved' && e === env && c === daCtx) {
        postObjVerCalled.push('postObjectVersionWithLabel');
        return {status: 201};
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
        return {status: 204};
      };

      const resp = await deleteObject(client, daCtx, 'aha.png', env, true);
      assert.equal(204, resp.status);
      assert.deepStrictEqual(['postObjectVersionWithLabel'], postObjVerCalled);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
