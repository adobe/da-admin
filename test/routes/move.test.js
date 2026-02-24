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

describe('Move Route', () => {
  it('returns 403 without write permission on source', async () => {
    const hasPermission = (c, k, a) => !(k === 'abc.html' && a === 'write');

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/utils/auth.js': { hasPermission },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/object/delete.js': { deleteObject: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/somedest/');
    const req = { formData: () => formdata };

    const resp = await moveRoute({ req, env: {}, daCtx: { key: 'abc.html' } });
    assert.strictEqual(resp.status, 403);
  });

  it('returns 403 without write permission on destination', async () => {
    const hasPermission = (c, k, a) => !(k === 'somedest' && a === 'write');

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/utils/auth.js': { hasPermission },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/object/delete.js': { deleteObject: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/somedest/');
    const req = { formData: () => formdata };

    const resp = await moveRoute({ req, env: {}, daCtx: { key: 'zzz.html' } });
    assert.strictEqual(resp.status, 403);
  });

  it('single file (ext) moves synchronously with copy then delete', async () => {
    const copyCalled = [];
    const deleteCalled = [];

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': {
        copyFile: (config, env, daCtx, key) => {
          copyCalled.push(key);
          return { $metadata: { httpStatusCode: 200 } };
        },
      },
      '../../src/storage/object/delete.js': {
        deleteObject: (client, daCtx, key) => {
          deleteCalled.push(key);
          return { status: 204 };
        },
      },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/someotherdest/');
    const req = { formData: () => formdata };

    const resp = await moveRoute({
      req,
      env: {},
      daCtx: { key: 'zzz.html', ext: 'html' },
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(JSON.parse(resp.body).total, 1);
    assert.deepStrictEqual(copyCalled, ['zzz.html']);
    assert.deepStrictEqual(deleteCalled, ['zzz.html']);
  });

  it('single file skips delete when copy returns non-200', async () => {
    const deleteCalled = [];

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 404 } }),
      },
      '../../src/storage/object/delete.js': {
        deleteObject: (client, daCtx, key) => {
          deleteCalled.push(key);
          return { status: 204 };
        },
      },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/dest/');
    const req = { formData: () => formdata };

    await moveRoute({ req, env: {}, daCtx: { key: 'x.html', ext: 'html' } });
    assert.strictEqual(deleteCalled.length, 0);
  });

  it('folder with COPY_QUEUE returns 202', async () => {
    let createdJob = null;

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/object/delete.js': { deleteObject: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => ['f', 'f.props'] },
      '../../src/storage/queue/jobs.js': {
        createJob: (env, opts) => { createdJob = opts; },
        enqueueKeys: () => {},
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/dest/');
    const req = { formData: () => formdata };
    const COPY_QUEUE = {};
    const DA_JOBS = { put: () => {}, delete: () => {} };

    const resp = await moveRoute({
      req,
      env: { COPY_QUEUE, DA_JOBS },
      daCtx: { key: 'f', users: [{ email: 'a@b.c' }] },
    });
    assert.strictEqual(resp.status, 202);
    assert.strictEqual(createdJob.type, 'move');
  });
});
