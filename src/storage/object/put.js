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
import { sourceRespObject, getFileBody, getObjectBody } from '../../helpers/source.js';

import { putObjectWithVersion } from '../version/put.js';

function buildInput({
  bucket, org, key, body, type,
}) {
  const Bucket = bucket;
  return {
    Bucket, Key: `${org}/${key}`, Body: body, ContentType: type,
  };
}

export default async function putObject(env, daCtx, obj) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const {
    bucket, org, key, propsKey,
  } = daCtx;

  const inputs = [];

  let metadata = {};
  let status = 201;
  if (obj) {
    if (obj.data) {
      const isFile = obj.data instanceof File;
      const { body, type } = isFile ? await getFileBody(obj.data) : getObjectBody(obj.data);
      const res = await putObjectWithVersion(env, daCtx, {
        bucket, org, key, body, type,
      }, false, obj.guid);
      status = res.status;
      metadata = res.metadata;
    }
  } else {
    const { body, type } = getObjectBody({});
    const inputConfig = {
      bucket, org, key: propsKey, body, type,
    };
    inputs.push(buildInput(inputConfig));
  }

  for (const input of inputs) {
    const command = new PutObjectCommand(input);
    await client.send(command);
  }

  const body = sourceRespObject(daCtx);
  return {
    body: JSON.stringify(body), status, contentType: 'application/json', metadata,
  };
}
