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
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

import getS3Config from '../utils/config.js';
import { listCommand } from '../utils/list.js';

export const copyFile = async (client, daCtx, sourceKey, details, isRename) => {
  const Key = `${sourceKey.replace(details.source, details.destination)}`;

  const input = {
    Bucket: `${daCtx.org}-content`,
    Key,
    CopySource: `${daCtx.org}-content/${sourceKey}`,
  };

  // We only want to keep the history if this was a rename. In case of an actual
  // copy we should start with clean history. The history is associated with the
  // ID of the object, so we need to generate a new ID for the object and also a
  // new ID for the version. We set the user to the user making the copy.
  if (!isRename) {
    input.Metadata = {
      ID: crypto.randomUUID(),
      Version: crypto.randomUUID(),
      Timestamp: `${Date.now()}`,
      Users: JSON.stringify(daCtx.users),
      Path: Key,
    };
    input.MetadataDirective = 'REPLACE';
  }

  try {
    await client.send(new CopyObjectCommand(input));
  } catch (e) {
    console.log({
      code: e.$metadata.httpStatusCode,
      dest: Key,
      src: `${daCtx.org}-content/${sourceKey}`,
    });
  }
};

export default async function copyObject(env, daCtx, details, isRename) {
  if (details.source === details.destination) return { body: '', status: 409 };

  const config = getS3Config(env);
  const client = new S3Client(config);

  const { sourceKeys, continuationToken } = await listCommand(daCtx, details, client);

  await Promise.all(sourceKeys.map(async (key) => {
    await copyFile(client, daCtx, key, details, isRename);
  }));

  return { body: JSON.stringify({ continuationToken }), status: 200 };
}
