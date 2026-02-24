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
import { S3Client } from '@aws-sdk/client-s3';
import processQueue from '@adobe/helix-shared-process-queue';
import { copyFile } from '../storage/object/copy.js';
import copyHelper from '../helpers/copy.js';
import { hasPermission } from '../utils/auth.js';
import getS3Config from '../storage/utils/config.js';
import { listAllKeys } from '../storage/utils/list.js';
import { createJob, deleteJob, enqueueKeys } from '../storage/queue/jobs.js';

export default async function copyHandler({ req, env, daCtx }) {
  const details = await copyHelper(req, daCtx);
  if (details.error) return details.error;
  if (details.source === details.destination) return { body: '', status: 409 };
  if (!hasPermission(daCtx, details.source, 'read')
    || !hasPermission(daCtx, details.destination, 'write')) return { status: 403 };

  if (daCtx.ext) {
    const config = getS3Config(env);
    const result = await copyFile(config, env, daCtx, daCtx.key, details, false);
    return {
      body: JSON.stringify({ total: 1 }),
      status: result.$metadata?.httpStatusCode ?? result.status ?? 200,
    };
  }

  const config = getS3Config(env);
  const client = new S3Client(config);
  const allKeys = await listAllKeys(daCtx, client);

  if (!env.COPY_QUEUE) {
    const total = allKeys.length;
    await processQueue(allKeys, (key) => copyFile(config, env, daCtx, key, details, false), 20);
    return { body: JSON.stringify({ total }), status: 200 };
  }

  const jobId = crypto.randomUUID();
  await createJob(env, {
    id: jobId, type: 'copy', total: allKeys.length, daCtx, details,
  });
  try {
    await enqueueKeys(env, jobId, allKeys);
  } catch (e) {
    await deleteJob(env, jobId);
    return { body: JSON.stringify({ error: 'Failed to enqueue' }), status: 500 };
  }
  return { body: JSON.stringify({ jobId, total: allKeys.length }), status: 202 };
}
