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
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import formatList from '../utils/list.js';

const limit = 100;

function buildInput({ org, key }) {
  return {
    Bucket: `${org}-content`,
    Prefix: key ? `${key}/` : null,
    Delimiter: '/',
  };
}

/**
 * Adds metadata to the list of objects specified.
 *
 * @param {S3Client} s3client the s3 client
 * @param {DaCtx} daCtx the DA context
 * @param {Object<{path: string, name: string}>} list list of entries
 */
async function populateMetadata(s3client, daCtx, list) {
  let idx = 0;
  while (idx < list.length) {
    const promises = list.slice(idx, idx + limit)
      .filter((item) => item.ext)
      .map(async (item) => {
        const Key = item.path.substring(1).split('/').slice(1).join('/');
        const input = { Bucket: `${daCtx.org}-content`, Key };
        const cmd = new HeadObjectCommand(input);
        return s3client.send(cmd).then((resp) => {
          if (resp.$metadata.httpStatusCode === 200) {
            // eslint-disable-next-line no-param-reassign
            item.lastModified = resp.LastModified.getTime();
          }
        });
      });
    await Promise.all(promises);
    idx += limit;
  }
}

export default async function listObjects(env, daCtx) {
  const config = getS3Config(env);
  const client = new S3Client(config);

  const input = buildInput(daCtx);
  const command = new ListObjectsV2Command(input);
  try {
    const resp = await client.send(command);
    // console.log(resp);
    const body = formatList(resp, daCtx);
    await populateMetadata(client, daCtx, body);
    return {
      body: JSON.stringify(body),
      status: resp.$metadata.httpStatusCode,
      contentType: resp.ContentType,
    };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
