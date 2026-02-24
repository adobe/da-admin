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
/* eslint-disable max-classes-per-file */

let DurableObject;
try {
  // eslint-disable-next-line import/no-unresolved -- cloudflare:workers is a runtime module
  ({ DurableObject } = await import('cloudflare:workers'));
} catch {
  DurableObject = class FallbackDO {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
    }
  };
}

const MAX_ERRORS = 50;
const TTL_SECONDS = 86400;
const STALENESS_MS = 15000;

/**
 * Durable Object for job state. Provides strongly consistent reads for copy/move/delete
 * progress, eliminating KV eventual consistency delays.
 */
export class JobState extends DurableObject {
  async create(record) {
    const now = Date.now();
    const full = {
      ...record,
      completed: 0,
      failed: 0,
      errors: [],
      createdAt: now,
      lastUpdated: now,
    };
    await this.ctx.storage.put('job', JSON.stringify(full));
    return full;
  }

  async getStatus() {
    const raw = await this.ctx.storage.get('job');
    if (!raw) return null;

    const job = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (Date.now() - job.createdAt > TTL_SECONDS) {
      await this.ctx.storage.delete('job');
      return null;
    }

    const processed = job.completed + job.failed;

    if (processed >= job.total) {
      job.state = 'complete';
    } else if (
      job.total - processed <= 10
      && Date.now() - job.lastUpdated > STALENESS_MS
    ) {
      job.state = 'complete';
    } else {
      job.state = 'running';
    }

    return job;
  }

  async incrementCompleted(count = 1) {
    const raw = await this.ctx.storage.get('job');
    if (!raw) return;

    const job = typeof raw === 'string' ? JSON.parse(raw) : raw;
    job.completed += count;
    job.lastUpdated = Date.now();

    await this.ctx.storage.put('job', JSON.stringify(job));
  }

  async recordFailure(sourceKey, errorMsg) {
    const raw = await this.ctx.storage.get('job');
    if (!raw) return;

    const job = typeof raw === 'string' ? JSON.parse(raw) : raw;
    job.failed += 1;
    if (job.errors.length < MAX_ERRORS) {
      job.errors.push({ key: sourceKey, error: errorMsg });
    }
    job.lastUpdated = Date.now();

    await this.ctx.storage.put('job', JSON.stringify(job));
  }

  async delete() {
    await this.ctx.storage.delete('job');
  }
}
