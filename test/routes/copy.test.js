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

describe('Copy Route', () => {
  it('returns 403 without read permission on source', async () => {
    const hasPermission = (c, k, a) => !(k === 'my/src.html' && a === 'read');

    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/my/dest.html');
    const req = { formData: () => formdata };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'my/src.html' } });
    assert.strictEqual(resp.status, 403);
  });

  it('returns 403 without write permission on destination', async () => {
    const hasPermission = (c, k, a) => !(k === 'my/dest.html' && a === 'write');

    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/my/dest.html');
    const req = { formData: () => formdata };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'my/src2.html' } });
    assert.strictEqual(resp.status, 403);
  });

  it('returns 409 when source equals destination', async () => {
    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/samepath');
    const req = { formData: () => formdata };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'samepath' } });
    assert.strictEqual(resp.status, 409);
  });

  it('single file (ext) copies synchronously', async () => {
    const copyCalled = [];
    const copyFile = (config, env, daCtx, key) => {
      copyCalled.push(key);
      return { $metadata: { httpStatusCode: 200 } };
    };

    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/dest.html');
    const req = { formData: () => formdata };

    const resp = await copyHandler({
      req,
      env: {},
      daCtx: { key: 'src.html', ext: 'html' },
    });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(JSON.parse(resp.body).total, 1);
    assert.strictEqual(copyCalled.length, 1);
    assert.strictEqual(copyCalled[0], 'src.html');
  });

  it('folder without COPY_QUEUE uses sync fallback', async () => {
    const copyCalled = [];
    const copyFile = () => {
      copyCalled.push(true);
      return { $metadata: { httpStatusCode: 200 } };
    };

    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => ['folder', 'folder.props', 'folder/a.html'] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/dest');
    const req = { formData: () => formdata };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'folder' } });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(copyCalled.length, 3);
    assert.strictEqual(JSON.parse(resp.body).total, 3);
  });

  it('folder with COPY_QUEUE returns 202 with jobId', async () => {
    let createdJob = null;
    let enqueuedKeys = null;

    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => ['f', 'f.props', 'f/a.html'] },
      '../../src/storage/queue/jobs.js': {
        createJob: (env, opts) => { createdJob = opts; },
        enqueueKeys: (env, jobId, keys) => { enqueuedKeys = keys; },
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/dest');
    const req = { formData: () => formdata };
    const COPY_QUEUE = {};
    const DA_JOBS = { put: () => {}, delete: () => {} };

    const resp = await copyHandler({
      req,
      env: { COPY_QUEUE, DA_JOBS },
      daCtx: { key: 'f', users: [{ email: 'a@b.c' }] },
    });
    assert.strictEqual(resp.status, 202);
    const body = JSON.parse(resp.body);
    assert.strictEqual(body.total, 3);
    assert.ok(body.jobId);
    assert.strictEqual(createdJob.type, 'copy');
    assert.deepStrictEqual(enqueuedKeys, ['f', 'f.props', 'f/a.html']);
  });

  it('enqueueKeys failure cleans up job and returns 500', async () => {
    let jobDeleted = false;

    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => ['f'] },
      '../../src/storage/queue/jobs.js': {
        createJob: () => {},
        enqueueKeys: () => { throw new Error('Queue failure'); },
        deleteJob: async () => { jobDeleted = true; },
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/dest');
    const req = { formData: () => formdata };
    const COPY_QUEUE = {};

    const resp = await copyHandler({
      req,
      env: { COPY_QUEUE },
      daCtx: { key: 'f', users: [{ email: 'a@b.c' }] },
    });
    assert.strictEqual(resp.status, 500);
    assert.ok(jobDeleted);
  });

  it('returns 400 when no destination provided', async () => {
    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': { listAllKeys: () => [] },
      '../../src/storage/queue/jobs.js': { createJob: () => {}, enqueueKeys: () => {} },
    });

    const formdata = new Map();
    const req = { formData: () => formdata };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'my/src.html' } });
    assert.strictEqual(resp.status, 400);
  });
});
