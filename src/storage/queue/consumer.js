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
import getS3Config from '../utils/config.js';
import { copyFile } from '../object/copy.js';
import { deleteObject } from '../object/delete.js';
import { getJob, incrementCompleted, recordFailure } from './jobs.js';

function reconstructDaCtx(context) {
  return {
    org: context.org,
    bucket: context.bucket,
    origin: context.origin,
    key: context.key,
    users: context.users,
    aclCtx: {
      pathLookup: new Map(context.aclPathLookup),
      actionSet: new Set(context.aclActionSet),
    },
  };
}

async function processMessage(message, daCtx, details, job, config, client, env) {
  const { sourceKey } = message.body;
  const { type } = job;

  if (type === 'copy') {
    const result = await copyFile(config, env, daCtx, sourceKey, details, false);
    const code = result.$metadata?.httpStatusCode ?? result.status;
    if (code === 200 || code === 201 || code === 404) return true;
    return false;
  }

  if (type === 'move') {
    const copyResult = await copyFile(config, env, daCtx, sourceKey, details, true);
    const copyCode = copyResult.$metadata?.httpStatusCode ?? copyResult.status;
    if (copyCode === 200) {
      const delResult = await deleteObject(client, daCtx, sourceKey, env);
      if (delResult instanceof Error) return false;
      return true;
    }
    if (copyCode === 201 || copyCode === 404) return true;
    return false;
  }

  if (type === 'delete') {
    const result = await deleteObject(client, daCtx, sourceKey, env);
    if (result instanceof Error) return false;
    return true;
  }

  return false;
}

// eslint-disable-next-line import/prefer-default-export
export async function handleQueueBatch(batch, env) {
  try {
    const config = getS3Config(env);
    const client = new S3Client(config);

    let cachedJob = null;
    let cachedJobId = null;

    const jobGroups = new Map();
    for (const message of batch.messages) {
      const { jobId } = message.body;
      if (!jobGroups.has(jobId)) jobGroups.set(jobId, []);
      jobGroups.get(jobId).push(message);
    }

    for (const [jobId, messages] of jobGroups) {
      if (cachedJobId !== jobId) {
        // eslint-disable-next-line no-await-in-loop
        cachedJob = await getJob(env, jobId);
        cachedJobId = jobId;
      }

      if (!cachedJob) {
        messages.forEach((msg) => msg.ack());
        // eslint-disable-next-line no-continue
        continue;
      }

      const daCtx = reconstructDaCtx(cachedJob.context);
      const details = {
        source: cachedJob.context.source || '',
        destination: cachedJob.context.destination || '',
      };

      let successCount = 0;

      for (const message of messages) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const ok = await processMessage(message, daCtx, details, cachedJob, config, client, env);
          if (ok) {
            successCount += 1;
            message.ack();
          } else if (message.attempts > 3) {
            // eslint-disable-next-line no-await-in-loop
            await recordFailure(env, jobId, message.body.sourceKey, 'Max retries exceeded');
            message.ack();
          } else {
            message.retry();
          }
        } catch (e) {
          if (message.attempts > 3) {
            // eslint-disable-next-line no-await-in-loop
            await recordFailure(env, jobId, message.body.sourceKey, e.message);
            message.ack();
          } else {
            message.retry();
          }
        }
      }

      if (successCount > 0) {
        // eslint-disable-next-line no-await-in-loop
        await incrementCompleted(env, jobId, successCount);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Queue batch processing failed', e);
    batch.retryAll();
  }
}
