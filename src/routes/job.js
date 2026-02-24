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
import { getJob } from '../storage/queue/jobs.js';

export default async function getJobStatus({ env, daCtx }) {
  const jobId = daCtx.name;
  const job = await getJob(env, jobId);
  if (!job) return { status: 404 };

  const callerEmail = daCtx.users?.[0]?.email;
  if (job.createdBy !== callerEmail) return { status: 403 };

  return {
    body: JSON.stringify({
      state: job.state,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      errors: job.errors,
    }),
    status: 200,
  };
}
