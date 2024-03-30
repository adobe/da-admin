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
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';

function buildInput(org, key) {
  return {
    Bucket: `${org}-content`,
    Prefix: `${key}/`,
  };
}

const copyFile = async (client, org, sourceKey, details) => {
  const Key = `${sourceKey.replace(details.source, details.destination)}`;

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: `${org}-content`,
        Key,
        CopySource: `${org}-content/${sourceKey}`,
      }),
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e.$metadata);
  }
};

export default async function copyObject(env, daCtx, details) {
  const config = getS3Config(env);
  const client = new S3Client(config);
  const input = buildInput(daCtx.org, details.source);

  let ContinuationToken;

  // The input prefix has a forward slash to prevent (drafts + drafts-new, etc.).
  // Which means the list will only pickup children. This adds to the initial list.
  const sourceKeys = [details.source, `${details.source}.props`];

  do {
    try {
      const command = new ListObjectsV2Command({ ...input, ContinuationToken });
      const resp = await client.send(command);

      const { Contents = [], NextContinuationToken } = resp;
      sourceKeys.push(...Contents.map(({ Key }) => Key));

      await Promise.all(
        new Array(1).fill(null).map(async () => {
          while (sourceKeys.length) {
            await copyFile(client, daCtx.org, sourceKeys.pop(), details);
          }
        }),
      );

      ContinuationToken = NextContinuationToken;
    } catch (e) {
      return { body: '', status: 404 };
    }
  } while (ContinuationToken);

  return { status: 204 };
}
