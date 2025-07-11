/*
 * Copyright 2025 Adobe. All rights reserved.
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

import { describe, it, vi, beforeAll } from 'vitest';

import { S3Client } from '@aws-sdk/client-s3';

import moveObject from "../../../src/storage/object/move.js";
import {copyFile} from "../../../src/storage/object/copy.js";
import {deleteObject} from "../../../src/storage/object/delete.js";
import {mockClient} from "aws-sdk-client-mock";

describe('Move', () => {
  const s3Mock = mockClient(S3Client);

  beforeAll(() => {
    vi.mock('../../../src/storage/object/copy.js', () => ({
      copyFile: vi.fn()
    }));
    vi.mock('../../../src/storage/object/delete.js', () => ({
      deleteObject: vi.fn()
    }));
  });

  it('Move files with permission check', async () => {
    s3Mock.onAnyCommand().resolves({ Contents: [
        { Key: 'somewhere/x.html' },
        { Key: 'somewhere/y.png' },
        { Key: 'somewhere/z.html' },
      ]});

    const copyFileCalled = [];
    const mockCopyFile = (c, e, x, k, d, m) => {
      copyFileCalled.push({ k, d, m });
      if (k === 'somewhere/y.png') return { $metadata: { httpStatusCode: 403 }};
      return { $metadata: { httpStatusCode: 200 }};
    };

    const deleteObjectCalled = [];
    const mockDeleteObject = (c, x, k, e, m) => {
      deleteObjectCalled.push({ k, m });
      return { status: 204 };
    };

    copyFile.mockImplementation(mockCopyFile);
    deleteObject.mockImplementation(mockDeleteObject);

    const pathLookup = new Map();
    pathLookup.set('blah@foo.org', [
      { path: '/somewhere/x.html', actions: ['read'] },
      { path: '/somewhere/+**', actions: ['read', 'write'] },
      { path: '/somedest/+**', actions: ['read', 'write'] },
    ]);
    const aclCtx = { pathLookup };
    const users = [ { email: 'blah@foo.org' }];
    const ctx = { aclCtx, users, key: 'q.html' };

    const details = { source: 'somewhere', destination: 'nonpermdest' };
    const resp = await moveObject({}, ctx, details);
    assert.strictEqual(204, resp.status);
    assert.strictEqual(0, copyFileCalled.length);
    assert.strictEqual(0, deleteObjectCalled.length)

    const details2 = { source: 'somewhere', destination: 'somedest' };
    const resp2 = await moveObject({}, ctx, details2);
    assert.strictEqual(204, resp2.status);

    assert.strictEqual(3, copyFileCalled.length);
    assert(copyFileCalled.every((c) => c.m === true), 'Move should be specified');
    assert(copyFileCalled.every((c) => c.d.source === 'somewhere' && c.d.destination === 'somedest'));
    const paths = new Set(copyFileCalled.map((c) => c.k));
    assert(paths.has('somewhere/y.png'));
    assert(paths.has('somewhere/z.html'));
    assert(paths.has('somewhere'));

    assert.strictEqual(2, deleteObjectCalled.length,
      'Note that copy y.png failed, so should not have deleted it');
    assert(deleteObjectCalled.every((c) => c.m === true), 'Move should be specified');
    const delPath = new Set(deleteObjectCalled.map((c) => c.k));
    assert(delPath.has('somewhere'));
    assert(delPath.has('somewhere/z.html'));

    // should have copied all except for x.html
    console.log(resp2);

    // do another test to a non-copyiable place
  });
});
