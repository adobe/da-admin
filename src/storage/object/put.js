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
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import { sourceRespObject } from '../../helpers/source.js';
import { putObjectWithVersion } from '../version/put.js';

async function getFileBody(data) {
  await data.text();
  return { body: data, type: data.type };
}

function getObjectBody(data) {
  // TODO: This will not correctly handle HTML as data
  return { body: JSON.stringify(data), type: 'application/json' };
}

function buildInput({
  org, key, body, type,
}) {
  const Bucket = `${org}-content`;
  return {
    Bucket, Key: key, Body: body, ContentType: type,
  };
}

function createBucketIfMissing(client) {
  client.middlewareStack.add(
    (next) => async (args) => {
      // eslint-disable-next-line no-param-reassign
      args.request.headers['cf-create-bucket-if-missing'] = 'true';
      return next(args);
    },
    {
      step: 'build',
      name: 'createIfMissingMiddleware',
      tags: ['METADATA', 'CREATE-BUCKET-IF-MISSING'],
    },
  );
}

/**
 * Check to see if the org is in the existing list of orgs
 *
 * @param {Object} env the cloud provider environment
 * @param {*} org the org associated with the bucket
 * @returns null
 */
async function checkOrgIndex(env, org) {
  const orgs = await env.DA_AUTH.get('orgs', { type: 'json' });
  if (orgs.some((existingOrg) => existingOrg.name === org)) return;
  orgs.push({ name: org, created: new Date().toISOString() });
  await env.DA_AUTH.put('orgs', JSON.stringify(orgs));
}

export default async function putObject(env, daCtx, obj) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const { org, key, propsKey } = daCtx;

  // Only allow creating a new bucket for orgs and repos
  if (key.split('/').length <= 1) {
    await checkOrgIndex(env, org);

    // R2 ONLY FEATURE
    createBucketIfMissing(client);
  }

  const inputs = [];

  let status = 201;
  if (obj) {
    if (obj.data) {
      const isFile = obj.data instanceof File;
      const { body, type } = isFile ? await getFileBody(obj.data) : getObjectBody(obj.data);
      status = await putObjectWithVersion(env, daCtx, {
        org, key, body, type,
      });
    }
  } else {
    const { body, type } = getObjectBody({});
    const inputConfig = {
      org, key: propsKey, body, type,
    };
    inputs.push(buildInput(inputConfig));
  }

  for (const input of inputs) {
    const command = new PutObjectCommand(input);
    await client.send(command);
  }

  const body = sourceRespObject(daCtx);
  return { body: JSON.stringify(body), status, contentType: 'application/json' };
}
