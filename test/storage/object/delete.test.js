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
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import deleteObjects, { deleteObject } from '../../../src/storage/object/delete.js';
import { postObjectVersionWithLabel } from '../../../src/storage/version/put.js';
import { listCommand } from '../../../src/storage/utils/list.js';
import { hasPermission } from '../../../src/utils/auth.js';

const s3Mock = mockClient(S3Client);

describe('Object delete', () => {
  beforeAll(() => {
    vi.mock('../../../src/storage/version/put.js', () => {
      const actual = vi.importActual('../../../src/storage/version/put.js');
      return {
        postObjectVersionWithLabel: vi.fn(actual.postObjectVersionWithLabel)
      };
    });
    vi.mock('../../../src/storage/utils/list.js', () => {
      const actual = vi.importActual('../../../src/storage/utils/list.js');
      return {
        listCommand: vi.fn(actual.listCommand)
      };
    });
    vi.mock('../../../src/utils/auth.js', () => {
      const actual = vi.importActual('../../../src/utils/auth.js');
      return {
        hasPermission: vi.fn(actual.hasPermission)
      };
    });
    vi.mock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: vi.fn()
    }));
  });

  beforeEach(() => {
    s3Mock.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('single context', () => {
    it('Delete a file', async () => {
      const collabCalled = [];
      const dacollab = { fetch: (u) => collabCalled.push(u) };

      const client = {};
      const env = { dacollab };
      const daCtx = {
        origin: 'https://admin.da.live',
        org: 'testorg',
      };

      const deleteURL = 'https://localhost:9876/foo/bar.html';
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue(deleteURL);

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({ status: 204 });

        const resp = await deleteObject(client, daCtx, 'foo/bar.html', env);
        expect(resp.status).to.eq(204);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('Delete dir', async () => {
      const client = {};
      const daCtx = {};
      const env = {};

      const deleteURL = 'https://localhost:9876/a/b/c/d';
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue(deleteURL);

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({ status: 204 });

        const resp = await deleteObject(client, daCtx, 'd', env, true);
        expect(resp.status).to.eq(204);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('Delete properties file', async () => {
      const client = {};
      const daCtx = {};
      const env = {};

      const deleteURL = 'https://localhost:9876/a/b/c/d.props';
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue(deleteURL);

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({ status: 204 });

        const resp = await deleteObject(client, daCtx, 'd.props', env, true);
        expect(resp.status).to.eq(204);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it('Move a non-doc resource', async () => {
      const client = {};
      const daCtx = {};
      const env = {};

      const deleteURL = 'https://localhost:9876/aha.png';
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue(deleteURL);

      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({ status: 204 });

        const resp = await deleteObject(client, daCtx, 'aha.png', env, true);
        expect(resp.status).to.eq(204);
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

      listCommand.mockResolvedValue({ sourceKeys: ['foo/bar.html'] });
      hasPermission.mockReturnValue(true);

      const resp = await deleteObjects(env, daCtx, {});
      expect(resp.status).to.eq(204);
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

      listCommand.mockResolvedValue({ 
        sourceKeys: ['foo/bar.html'], 
        continuationToken: 'token' 
      });
      hasPermission.mockReturnValue(true);

      const resp = await deleteObjects(env, daCtx, {});
      expect(resp.status).to.eq(206);
    });

    it('Delete permissions', async () => {
      const pathLookup = new Map();
      pathLookup.set('harry@foo.org', [
        { path: '/a', actions: [] },
        { path: '/b', actions: ['read'] },
        { path: '/c', actions: ['read', 'write'] },
      ]);
      const aclCtx = { pathLookup };
      const users = [{ email: 'harry@foo.org' }];
      const ctx = { aclCtx, users, key: 'notused' };

      listCommand.mockResolvedValue({ sourceKeys: ['a', 'b', 'c'] });
      hasPermission.mockImplementation((daCtx, key) => {
        if (key === 'c') return true;
        return false;
      });

      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockImplementation((client, command) => command.input.Key);

      const fetchURLs = [];
      const savedFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockImplementation((url) => {
          fetchURLs.push(url);
          return Promise.resolve({ status: 200 });
        });

        const resp = await deleteObjects({}, ctx, {});
        expect(resp.status).to.eq(204);
      } finally {
        globalThis.fetch = savedFetch;
      }
      expect(fetchURLs).to.deep.eq(['c']);
    });
  });
});
