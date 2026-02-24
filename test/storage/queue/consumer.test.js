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
/* eslint-disable no-underscore-dangle */
import assert from 'node:assert';
import esmock from 'esmock';

function mockMessage(jobId, sourceKey, attempts = 1) {
  const acked = [];
  const retried = [];
  return {
    body: { jobId, sourceKey },
    attempts,
    ack: () => { acked.push(true); },
    retry: () => { retried.push(true); },
    _acked: acked,
    _retried: retried,
  };
}

function mockBatch(messages) {
  const retryAllCalled = [];
  return {
    messages,
    retryAll: () => { retryAllCalled.push(true); },
    _retryAllCalled: retryAllCalled,
  };
}

function makeJobRecord(type, overrides = {}) {
  return JSON.stringify({
    id: 'test-job',
    type,
    total: 10,
    completed: 0,
    failed: 0,
    errors: [],
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    createdBy: 'user@test.com',
    context: {
      org: 'testorg',
      bucket: 'test-bucket',
      origin: 'https://admin.da.live',
      key: 'folder',
      source: 'folder',
      destination: 'dest',
      users: [{ email: 'user@test.com', ident: 'uid1', orgs: [] }],
      aclPathLookup: [],
      aclActionSet: ['read', 'write'],
    },
    ...overrides,
  });
}

function mockDO(jobRecord) {
  const store = {};
  if (jobRecord) {
    const parsed = typeof jobRecord === 'string' ? JSON.parse(jobRecord) : jobRecord;
    store['test-job'] = parsed;
  }
  return {
    idFromName: (name) => ({ __name: name }),
    get: (id) => {
      const jobId = id?.__name;
      return {
        getStatus: async () => {
          const raw = store[jobId];
          if (!raw) return null;
          const job = { ...raw };
          const processed = job.completed + job.failed;
          job.state = processed >= job.total ? 'complete' : 'running';
          return job;
        },
        incrementCompleted: async (count = 1) => {
          const job = store[jobId];
          if (job) {
            job.completed += count;
            job.lastUpdated = Date.now();
          }
        },
        recordFailure: async () => {
          const job = store[jobId];
          if (job) {
            job.failed += 1;
            job.lastUpdated = Date.now();
          }
        },
      };
    },
    _store: store,
  };
}

describe('Queue Consumer', () => {
  it('processes copy messages and acks on success', async () => {
    const copyFileCalled = [];

    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: (config, env, daCtx, key) => {
          copyFileCalled.push(key);
          return { $metadata: { httpStatusCode: 200 } };
        },
      },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({ status: 204 }) },
    });

    const msg = mockMessage('test-job', 'folder/a.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('copy'));

    await handleQueueBatch(batch, { DA_JOBS });

    assert.strictEqual(msg._acked.length, 1);
    assert.strictEqual(msg._retried.length, 0);
    assert.strictEqual(copyFileCalled.length, 1);
  });

  it('treats copyFile 404 as success', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 404 } }),
      },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({ status: 204 }) },
    });

    const msg = mockMessage('test-job', 'folder/missing.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('copy'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
    assert.strictEqual(msg._retried.length, 0);
  });

  it('handles copyFile 412 putObjectWithVersion return shape (status: 201)', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ status: 201, metadata: { id: 'xxx' } }),
      },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({ status: 204 }) },
    });

    const msg = mockMessage('test-job', 'folder/conflict.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('copy'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
  });

  it('retries failed copy messages', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 500 } }),
      },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({ status: 204 }) },
    });

    const msg = mockMessage('test-job', 'folder/fail.html', 1);
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('copy'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._retried.length, 1);
    assert.strictEqual(msg._acked.length, 0);
  });

  it('records failure after max retries (attempts > 3)', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 500 } }),
      },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({ status: 204 }) },
    });

    const msg = mockMessage('test-job', 'folder/fail.html', 4);
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('copy'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
    assert.strictEqual(msg._retried.length, 0);
    const stored = DA_JOBS._store['test-job'];
    assert.strictEqual(stored.failed, 1);
  });

  it('processes move messages: copy then delete on success', async () => {
    const deleteCalled = [];

    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 200 } }),
      },
      '../../../src/storage/object/delete.js': {
        deleteObject: (client, daCtx, key) => {
          deleteCalled.push(key);
          return { status: 204 };
        },
      },
    });

    const msg = mockMessage('test-job', 'folder/a.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('move'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
    assert.strictEqual(deleteCalled.length, 1);
  });

  it('move skips delete when copyFile returns 404', async () => {
    const deleteCalled = [];

    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 404 } }),
      },
      '../../../src/storage/object/delete.js': {
        deleteObject: (client, daCtx, key) => {
          deleteCalled.push(key);
          return { status: 204 };
        },
      },
    });

    const msg = mockMessage('test-job', 'folder/missing.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('move'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
    assert.strictEqual(deleteCalled.length, 0);
  });

  it('move detects deleteObject Error as failure', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: () => ({ $metadata: { httpStatusCode: 200 } }),
      },
      '../../../src/storage/object/delete.js': {
        deleteObject: () => new Error('delete failed'),
      },
    });

    const msg = mockMessage('test-job', 'folder/a.html', 1);
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('move'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._retried.length, 1);
  });

  it('processes delete messages', async () => {
    const deleteCalled = [];

    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../../src/storage/object/delete.js': {
        deleteObject: (client, daCtx, key) => {
          deleteCalled.push(key);
          return { status: 204 };
        },
      },
    });

    const msg = mockMessage('test-job', 'folder/a.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('delete'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
    assert.strictEqual(deleteCalled.length, 1);
  });

  it('acks all messages when job record is expired/null', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({}) },
    });

    const msg = mockMessage('test-job', 'folder/a.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO();

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(msg._acked.length, 1);
  });

  it('retries entire batch on top-level error', async () => {
    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': {
        default: () => { throw new Error('config boom'); },
      },
      '../../../src/storage/object/copy.js': { copyFile: () => {} },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({}) },
    });

    const msg = mockMessage('test-job', 'folder/a.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(makeJobRecord('copy'));

    await handleQueueBatch(batch, { DA_JOBS });
    assert.strictEqual(batch._retryAllCalled.length, 1);
  });

  it('reconstructs daCtx with Map and Set from job context', async () => {
    let capturedDaCtx = null;

    const { handleQueueBatch } = await esmock('../../../src/storage/queue/consumer.js', {
      '../../../src/storage/utils/config.js': { default: () => ({}) },
      '../../../src/storage/object/copy.js': {
        copyFile: (config, env, daCtx) => {
          capturedDaCtx = daCtx;
          return { $metadata: { httpStatusCode: 200 } };
        },
      },
      '../../../src/storage/object/delete.js': { deleteObject: () => ({}) },
    });

    const jobRecord = makeJobRecord('copy');
    const parsed = JSON.parse(jobRecord);
    parsed.context.aclPathLookup = [['user@test.com', [{ path: '/x', actions: ['read'] }]]];
    parsed.context.aclActionSet = ['read', 'write'];

    const msg = mockMessage('test-job', 'folder/a.html');
    const batch = mockBatch([msg]);
    const DA_JOBS = mockDO(parsed);

    await handleQueueBatch(batch, { DA_JOBS });

    assert.ok(capturedDaCtx);
    assert.ok(capturedDaCtx.aclCtx.pathLookup instanceof Map);
    assert.ok(capturedDaCtx.aclCtx.actionSet instanceof Set);
    assert.strictEqual(capturedDaCtx.aclCtx.pathLookup.get('user@test.com')[0].path, '/x');
    assert.ok(capturedDaCtx.aclCtx.actionSet.has('read'));
  });
});
