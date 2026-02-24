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
import getObject from '../storage/object/get.js';
import putObject from '../storage/object/put.js';
import { deleteObject } from '../storage/object/delete.js';
import { notifyCollab } from '../storage/utils/object.js';

import putHelper from '../helpers/source.js';
import { hasPermission } from '../utils/auth.js';
import getS3Config from '../storage/utils/config.js';
import { listAllKeys } from '../storage/utils/list.js';
import { createJob, deleteJob, enqueueKeys } from '../storage/queue/jobs.js';

export async function deleteSource({ env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return { status: 403 };

  if (daCtx.ext) {
    const config = getS3Config(env);
    const client = new S3Client(config);
    const resp = await deleteObject(client, daCtx, daCtx.key, env);
    if (resp instanceof Error) return { status: 500 };
    return { status: resp?.status ?? 204 };
  }

  const config = getS3Config(env);
  const client = new S3Client(config);
  const allKeys = await listAllKeys(daCtx, client);

  if (!env.COPY_QUEUE) {
    await processQueue(allKeys, (key) => deleteObject(client, daCtx, key, env), 20);
    return { status: 204 };
  }

  const jobId = crypto.randomUUID();
  await createJob(env, {
    id: jobId, type: 'delete', total: allKeys.length, daCtx, details: {},
  });
  try {
    await enqueueKeys(env, jobId, allKeys);
  } catch (e) {
    await deleteJob(env, jobId);
    return { body: JSON.stringify({ error: 'Failed to enqueue' }), status: 500 };
  }
  return { body: JSON.stringify({ jobId, total: allKeys.length }), status: 202 };
}

export async function postSource({ req, env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'write')) return { status: 403 };
  const obj = await putHelper(req, env, daCtx);
  const resp = await putObject(env, daCtx, obj);

  if (resp.status === 201 || resp.status === 200) {
    const initiator = req.headers.get('x-da-initiator');
    if (initiator !== 'collab') {
      await notifyCollab('syncadmin', req.url, env);
    }
  }
  return resp;
}

export async function getSource({ env, daCtx, head }) {
  if (!hasPermission(daCtx, daCtx.key, 'read')) return { status: 403 };
  return getObject(env, daCtx, head, daCtx.conditionalHeaders);
}
