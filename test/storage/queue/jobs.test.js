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
import {
  createJob, getJob, incrementCompleted, recordFailure, deleteJob, enqueueKeys,
} from '../../../src/storage/queue/jobs.js';

const STALENESS_MS = 15000;

function mockDO() {
  const store = {};
  return {
    idFromName: (name) => ({ __name: name }),
    get: (id) => {
      const jobId = id?.__name;
      return {
        create: async (record) => {
          const full = {
            ...record,
            completed: 0,
            failed: 0,
            errors: [],
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          };
          store[jobId] = full;
          return full;
        },
        getStatus: async () => {
          const raw = store[jobId];
          if (!raw) return null;
          const job = { ...raw };
          const processed = job.completed + job.failed;
          if (processed >= job.total) {
            job.state = 'complete';
          } else if (job.total - processed <= 10 && Date.now() - job.lastUpdated > STALENESS_MS) {
            job.state = 'complete';
          } else {
            job.state = 'running';
          }
          return job;
        },
        incrementCompleted: async (count = 1) => {
          const job = store[jobId];
          if (job) {
            job.completed += count;
            job.lastUpdated = Date.now();
          }
        },
        recordFailure: async (sourceKey, errorMsg) => {
          const job = store[jobId];
          if (job) {
            job.failed += 1;
            if (job.errors.length < 50) job.errors.push({ key: sourceKey, error: errorMsg });
            job.lastUpdated = Date.now();
          }
        },
        delete: async () => { delete store[jobId]; },
      };
    },
    _store: store,
  };
}

function mockDaCtx() {
  return {
    org: 'testorg',
    bucket: 'test-bucket',
    origin: 'https://admin.da.live',
    key: 'some/folder',
    users: [{
      email: 'user@example.com',
      ident: 'uid123',
      orgs: [{ orgName: 'MyOrg', orgIdent: 'org123', groups: [{ groupName: 'editors' }] }],
    }],
    aclCtx: {
      pathLookup: new Map([['user@example.com', [{ path: '/source/some', actions: ['read', 'write'] }]]]),
      actionSet: new Set(['read', 'write']),
    },
  };
}

describe('Queue Jobs', () => {
  describe('createJob', () => {
    it('creates a job record with correct fields', async () => {
      const DA_JOBS = mockDO();
      const env = { DA_JOBS };
      const daCtx = mockDaCtx();

      const record = await createJob(env, {
        id: 'test-uuid', type: 'copy', total: 10, daCtx, details: { source: 'src', destination: 'dst' },
      });

      assert.strictEqual(record.id, 'test-uuid');
      assert.strictEqual(record.type, 'copy');
      assert.strictEqual(record.total, 10);
      assert.strictEqual(record.completed, 0);
      assert.strictEqual(record.failed, 0);
      assert.strictEqual(record.createdBy, 'user@example.com');
      assert.strictEqual(record.context.source, 'src');
      assert.strictEqual(record.context.destination, 'dst');
      assert.strictEqual(record.context.org, 'testorg');
      assert.ok(record.context.users[0].orgs);

      const stored = DA_JOBS._store['test-uuid'];
      assert.strictEqual(stored.id, 'test-uuid');
    });

    it('defaults empty source/destination for delete operations', async () => {
      const DA_JOBS = mockDO();
      const env = { DA_JOBS };
      const daCtx = mockDaCtx();

      const record = await createJob(env, {
        id: 'del-uuid', type: 'delete', total: 5, daCtx, details: {},
      });

      assert.strictEqual(record.context.source, '');
      assert.strictEqual(record.context.destination, '');
    });

    it('serializes ACL pathLookup as array of entries', async () => {
      const DA_JOBS = mockDO();
      const env = { DA_JOBS };
      const daCtx = mockDaCtx();

      await createJob(env, {
        id: 'acl-uuid', type: 'copy', total: 1, daCtx, details: { source: 'a', destination: 'b' },
      });

      const stored = DA_JOBS._store['acl-uuid'];
      assert.ok(Array.isArray(stored.context.aclPathLookup));
      assert.strictEqual(stored.context.aclPathLookup[0][0], 'user@example.com');
      assert.ok(Array.isArray(stored.context.aclActionSet));
      assert.ok(stored.context.aclActionSet.includes('read'));
    });
  });

  describe('getJob', () => {
    it('returns null for missing job', async () => {
      const DA_JOBS = mockDO();
      const env = { DA_JOBS };
      const result = await getJob(env, 'nonexistent');
      assert.strictEqual(result, null);
    });

    it('computes state as running when incomplete', async () => {
      const DA_JOBS = mockDO();
      DA_JOBS._store['run-id'] = {
        total: 100, completed: 50, failed: 0, lastUpdated: Date.now(),
      };
      const env = { DA_JOBS };

      const job = await getJob(env, 'run-id');
      assert.strictEqual(job.state, 'running');
    });

    it('computes state as complete when all processed', async () => {
      const DA_JOBS = mockDO();
      DA_JOBS._store['done-id'] = {
        total: 10, completed: 8, failed: 2, lastUpdated: Date.now(),
      };
      const env = { DA_JOBS };

      const job = await getJob(env, 'done-id');
      assert.strictEqual(job.state, 'complete');
    });

    it('computes complete on staleness with near-total', async () => {
      const DA_JOBS = mockDO();
      DA_JOBS._store['stale-id'] = {
        total: 10, completed: 2, failed: 0, lastUpdated: Date.now() - 20000,
      };
      const env = { DA_JOBS };

      const job = await getJob(env, 'stale-id');
      assert.strictEqual(job.state, 'complete');
    });
  });

  describe('incrementCompleted', () => {
    it('increments completed count', async () => {
      const DA_JOBS = mockDO();
      DA_JOBS._store['inc-id'] = {
        total: 10, completed: 3, failed: 0, lastUpdated: 0,
      };
      const env = { DA_JOBS };

      await incrementCompleted(env, 'inc-id', 5);
      const stored = DA_JOBS._store['inc-id'];
      assert.strictEqual(stored.completed, 8);
      assert.ok(stored.lastUpdated > 0);
    });

    it('does nothing for missing job', async () => {
      const DA_JOBS = mockDO();
      const env = { DA_JOBS };
      await incrementCompleted(env, 'missing', 1);
      assert.strictEqual(Object.keys(DA_JOBS._store).length, 0);
    });
  });

  describe('recordFailure', () => {
    it('records failure and appends error', async () => {
      const DA_JOBS = mockDO();
      DA_JOBS._store['fail-id'] = {
        total: 10, completed: 0, failed: 0, errors: [], lastUpdated: 0,
      };
      const env = { DA_JOBS };

      await recordFailure(env, 'fail-id', 'bad/key.html', 'Some error');
      const stored = DA_JOBS._store['fail-id'];
      assert.strictEqual(stored.failed, 1);
      assert.strictEqual(stored.errors.length, 1);
      assert.strictEqual(stored.errors[0].key, 'bad/key.html');
    });

    it('caps errors at 50', async () => {
      const DA_JOBS = mockDO();
      const errors = [];
      for (let i = 0; i < 50; i += 1) {
        errors.push({ key: `key${i}`, error: 'err' });
      }
      DA_JOBS._store['cap-id'] = {
        total: 100, completed: 0, failed: 50, errors, lastUpdated: 0,
      };
      const env = { DA_JOBS };

      await recordFailure(env, 'cap-id', 'extra.html', 'Too many');
      const stored = DA_JOBS._store['cap-id'];
      assert.strictEqual(stored.failed, 51);
      assert.strictEqual(stored.errors.length, 50);
    });
  });

  describe('deleteJob', () => {
    it('removes job from storage', async () => {
      const DA_JOBS = mockDO();
      DA_JOBS._store['del-me'] = { total: 1, completed: 0 };
      const env = { DA_JOBS };

      await deleteJob(env, 'del-me');
      assert.strictEqual(DA_JOBS._store['del-me'], undefined);
    });
  });

  describe('enqueueKeys', () => {
    it('sends messages in batches of 100', async () => {
      const batches = [];
      const env = {
        COPY_QUEUE: {
          sendBatch: (msgs) => { batches.push(msgs); },
        },
      };

      const keys = [];
      for (let i = 0; i < 250; i += 1) keys.push(`key${i}`);

      await enqueueKeys(env, 'job-id', keys);
      assert.strictEqual(batches.length, 3);
      assert.strictEqual(batches[0].length, 100);
      assert.strictEqual(batches[1].length, 100);
      assert.strictEqual(batches[2].length, 50);
      assert.strictEqual(batches[0][0].body.jobId, 'job-id');
      assert.strictEqual(batches[0][0].body.sourceKey, 'key0');
    });
  });
});
