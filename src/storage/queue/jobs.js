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

const BATCH_SIZE = 100;

function getStub(env, jobId) {
  const id = env.DA_JOBS.idFromName(jobId);
  return env.DA_JOBS.get(id);
}

export async function createJob(env, {
  id, type, total, daCtx, details,
}) {
  const record = {
    id,
    type,
    total,
    createdBy: daCtx.users[0].email,
    context: {
      org: daCtx.org,
      bucket: daCtx.bucket,
      origin: daCtx.origin,
      key: daCtx.key,
      source: details.source || '',
      destination: details.destination || '',
      users: daCtx.users,
      aclPathLookup: daCtx.aclCtx?.pathLookup
        ? Array.from(daCtx.aclCtx.pathLookup.entries())
        : [],
      aclActionSet: daCtx.aclCtx?.actionSet
        ? Array.from(daCtx.aclCtx.actionSet)
        : [],
    },
  };

  const stub = getStub(env, id);
  return stub.create(record);
}

export async function getJob(env, jobId) {
  const stub = getStub(env, jobId);
  return stub.getStatus();
}

export async function incrementCompleted(env, jobId, count = 1) {
  const stub = getStub(env, jobId);
  return stub.incrementCompleted(count);
}

export async function recordFailure(env, jobId, sourceKey, errorMsg) {
  const stub = getStub(env, jobId);
  return stub.recordFailure(sourceKey, errorMsg);
}

export async function deleteJob(env, jobId) {
  const stub = getStub(env, jobId);
  return stub.delete();
}

export async function enqueueKeys(env, jobId, keys) {
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const messages = batch.map((sourceKey) => ({
      body: { jobId, sourceKey },
    }));
    // eslint-disable-next-line no-await-in-loop
    await env.COPY_QUEUE.sendBatch(messages);
  }
}
