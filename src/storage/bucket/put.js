/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {
  S3Client,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import getS3Config from '../utils/config.js';

/**
 * Creates the bucket as specified by the org within the DaCtx
 *
 * @param env the worker environment
 * @param daCtx the current context
 * @return {Promise<boolean>} true if bucket was created, false if an error occurred
 */
export default async function putBuket(env, daCtx) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const { org, users } = daCtx;
  const input = {
    Bucket: `${org}-content`,
    ACL: 'private',
  };

  const command = new CreateBucketCommand(input);
  try {
    await client.send(command);

    const data = [];
    users.forEach((user) => {
      data.push({ key: 'admin.role.all', value: user.email });
    });

    const sheet = {
      total: data.length,
      limit: data.length,
      offset: 0,
      data,
      ':type': 'sheet',
    };
    await env.DA_CONFIG.put(org, JSON.stringify(sheet));

    const orgs = await env.DA_AUTH.get('orgs', { type: 'json' });
    orgs.push({ name: org, created: new Date().toISOString() });
    await env.DA_AUTH.put('orgs', JSON.stringify(orgs));

    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
    return false;
  }
}
