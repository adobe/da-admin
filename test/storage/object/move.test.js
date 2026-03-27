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
import esmock from 'esmock';

let mockSendFn;

class MockS3Client {
  // eslint-disable-next-line class-methods-use-this
  // eslint-disable-next-line class-methods-use-this
  send() { return mockSendFn(); }
}

describe('Move', () => {
  it('Move files with permission check', async () => {
    mockSendFn = () => ({
      Contents: [
        { Key: 'myorg/somewhere/x.html' },
        { Key: 'myorg/somewhere/y.png' },
        { Key: 'myorg/somewhere/z.html' },
      ],
    });

    const copyFileCalled = [];
    const copyFile = (c, e, x, k, d, m) => {
      copyFileCalled.push({ k, d, m });
      if (k === 'somewhere/y.png') return { $metadata: { httpStatusCode: 403 } };
      return { $metadata: { httpStatusCode: 200 } };
    };

    const deleteObjectCalled = [];
    const deleteObject = (c, x, k, e, m) => {
      deleteObjectCalled.push({ k, m });
      return { status: 204 };
    };

    const moveObject = await esmock('../../../src/storage/object/move.js', {
      '@aws-sdk/client-s3': {
        S3Client: MockS3Client,
      },
      '../../../src/storage/object/copy.js': {
        copyFile,
      },
      '../../../src/storage/object/delete.js': {
        deleteObject,
      },
    });

    const pathLookup = new Map();
    pathLookup.set('blah@foo.org', [
      { path: '/somewhere/x.html', actions: ['read'] },
      { path: '/somewhere/+**', actions: ['read', 'write'] },
      { path: '/somedest/+**', actions: ['read', 'write'] },
    ]);
    const aclCtx = { pathLookup };
    const users = [{ email: 'blah@foo.org' }];
    const ctx = {
      org: 'myorg', aclCtx, users, key: 'q.html',
    };

    const details = { source: 'somewhere', destination: 'nonpermdest' };
    const resp = await moveObject({}, ctx, details);
    assert.strictEqual(204, resp.status);
    assert.strictEqual(0, copyFileCalled.length);
    assert.strictEqual(0, deleteObjectCalled.length);

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

    assert.strictEqual(
      2,
      deleteObjectCalled.length,
      'Note that copy y.png failed, so should not have deleted it',
    );
    assert(deleteObjectCalled.every((c) => c.m === true), 'Move should be specified');
    const delPath = new Set(deleteObjectCalled.map((c) => c.k));
    assert(delPath.has('somewhere'));
    assert(delPath.has('somewhere/z.html'));

    // should have copied all except for x.html
    console.log(resp2);

    // do another test to a non-copyiable place
  });

  it('Returns JSON error body when S3 list throws', async () => {
    mockSendFn = () => {
      throw new Error('R2 throttled');
    };

    const moveObject = await esmock('../../../src/storage/object/move.js', {
      '@aws-sdk/client-s3': { S3Client: MockS3Client },
      '../../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../../src/storage/object/delete.js': { deleteObject: () => {} },
    });

    const pathLookup = new Map();
    const ctx = {
      org: 'myorg', aclCtx: { pathLookup }, users: [], key: 'q.html',
    };
    const resp = await moveObject({}, ctx, { source: 'somewhere', destination: 'somedest' });

    assert.strictEqual(resp.status, 500);
    const body = JSON.parse(resp.body);
    assert.strictEqual(body.error, 'move_failed');
  });

  it('Returns partial_failure JSON when a file copy rejects', async () => {
    // Contents excludes the source file itself — S3 list prefix has a trailing slash
    mockSendFn = () => ({ Contents: [{ Key: 'myorg/somewhere/b.html' }] });

    const copyFileCalled = [];
    const copyFile = (c, e, x, k) => {
      copyFileCalled.push(k);
      if (k === 'somewhere/a.html') throw new Error('R2 throttled');
      return { $metadata: { httpStatusCode: 200 } };
    };

    const deleteObjectCalled = [];
    const deleteObject = (c, x, k) => {
      deleteObjectCalled.push(k);
      return { status: 204 };
    };

    const moveObject = await esmock('../../../src/storage/object/move.js', {
      '@aws-sdk/client-s3': { S3Client: MockS3Client },
      '../../../src/storage/object/copy.js': { copyFile },
      '../../../src/storage/object/delete.js': { deleteObject },
    });

    const pathLookup = new Map();
    pathLookup.set('blah@foo.org', [
      { path: '/somewhere/+**', actions: ['read', 'write'] },
      { path: '/somedest/+**', actions: ['read', 'write'] },
    ]);
    const ctx = {
      org: 'myorg',
      aclCtx: { pathLookup },
      users: [{ email: 'blah@foo.org' }],
      isFile: true,
      key: 'q.html',
    };
    const resp = await moveObject({}, ctx, { source: 'somewhere/a.html', destination: 'somedest/a.html' });

    // a.html (from initialKeys) throws, b.html succeeds — one failure, one success
    assert.strictEqual(resp.status, 500);
    const body = JSON.parse(resp.body);
    assert.strictEqual(body.error, 'partial_failure');
    assert.strictEqual(body.failed, 1);
    assert.strictEqual(deleteObjectCalled.length, 1, 'b.html should still be deleted despite a.html failing');
  });

  it('Does not re-process page 1 keys on page 2 iteration', async () => {
    let callCount = 0;
    mockSendFn = () => {
      callCount += 1;
      if (callCount === 1) {
        return { Contents: [{ Key: 'myorg/somewhere/a.html' }], NextContinuationToken: 'token1' };
      }
      return { Contents: [{ Key: 'myorg/somewhere/b.html' }] };
    };

    const copyFileCalled = [];
    const copyFile = (c, e, x, k) => {
      copyFileCalled.push(k);
      return { $metadata: { httpStatusCode: 200 } };
    };

    const moveObject = await esmock('../../../src/storage/object/move.js', {
      '@aws-sdk/client-s3': { S3Client: MockS3Client },
      '../../../src/storage/object/copy.js': { copyFile },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({ status: 204 }) },
    });

    const pathLookup = new Map();
    pathLookup.set('blah@foo.org', [
      { path: '/somewhere/+**', actions: ['read', 'write'] },
      { path: '/somedest/+**', actions: ['read', 'write'] },
    ]);
    const ctx = {
      org: 'myorg', aclCtx: { pathLookup }, users: [{ email: 'blah@foo.org' }], isFile: true, key: 'q.html',
    };
    const resp = await moveObject({}, ctx, { source: 'somewhere', destination: 'somedest' });

    assert.strictEqual(resp.status, 204);
    // a.html from page 1 must appear exactly once, not again on the page 2 pass
    const aCopies = copyFileCalled.filter((k) => k === 'somewhere/a.html');
    const bCopies = copyFileCalled.filter((k) => k === 'somewhere/b.html');
    assert.strictEqual(aCopies.length, 1, 'page 1 key must not be re-processed on page 2');
    assert.strictEqual(bCopies.length, 1, 'page 2 key must be processed once');
  });
});
