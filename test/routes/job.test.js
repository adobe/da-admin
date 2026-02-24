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

describe('Job Route', () => {
  it('returns job status for matching creator', async () => {
    const getJobStatus = await esmock('../../src/routes/job.js', {
      '../../src/storage/queue/jobs.js': {
        getJob: () => ({
          state: 'running',
          total: 100,
          completed: 42,
          failed: 1,
          errors: [{ key: 'x.html', error: 'fail' }],
          createdBy: 'user@test.com',
        }),
      },
    });

    const daCtx = {
      name: 'test-job-id',
      users: [{ email: 'user@test.com' }],
    };

    const resp = await getJobStatus({ env: {}, daCtx });
    assert.strictEqual(resp.status, 200);

    const body = JSON.parse(resp.body);
    assert.strictEqual(body.state, 'running');
    assert.strictEqual(body.total, 100);
    assert.strictEqual(body.completed, 42);
    assert.strictEqual(body.failed, 1);
    assert.strictEqual(body.errors.length, 1);
  });

  it('returns 404 for missing/expired job', async () => {
    const getJobStatus = await esmock('../../src/routes/job.js', {
      '../../src/storage/queue/jobs.js': {
        getJob: () => null,
      },
    });

    const daCtx = {
      name: 'nonexistent',
      users: [{ email: 'user@test.com' }],
    };

    const resp = await getJobStatus({ env: {}, daCtx });
    assert.strictEqual(resp.status, 404);
  });

  it('returns 403 when caller does not match createdBy', async () => {
    const getJobStatus = await esmock('../../src/routes/job.js', {
      '../../src/storage/queue/jobs.js': {
        getJob: () => ({
          state: 'complete',
          total: 10,
          completed: 10,
          failed: 0,
          errors: [],
          createdBy: 'owner@test.com',
        }),
      },
    });

    const daCtx = {
      name: 'test-job-id',
      users: [{ email: 'attacker@evil.com' }],
    };

    const resp = await getJobStatus({ env: {}, daCtx });
    assert.strictEqual(resp.status, 403);
  });
});
