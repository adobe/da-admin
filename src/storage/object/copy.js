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

import getObject from './get.js';
import getS3Config from '../utils/config.js';
import { invalidateCollab } from '../utils/object.js';
import { putObjectWithVersion } from '../version/put.js';
import { listCommand } from '../utils/list.js';

const MAX_KEYS = 900;

export const copyFile = async (config, env, daCtx, sourceKey, details, isRename) => {
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
    const client = new S3Client(config);
    client.middlewareStack.add(
      (next) => async (args) => {
        // eslint-disable-next-line no-param-reassign
        args.request.headers['cf-copy-destination-if-none-match'] = '*';
        return next(args);
      },
      {
        step: 'build',
        name: 'ifNoneMatchMiddleware',
        tags: ['METADATA', 'IF-NONE-MATCH'],
      },
    );
    const resp = await client.send(new CopyObjectCommand(input));
    return resp;
  } catch (e) {
    if (e.$metadata.httpStatusCode === 412) {
      // Not the happy path - something is at the destination already.
      if (!isRename) {
        // This is a copy so just put the source into the target to keep the history.

        const original = await getObject(env, { org: daCtx.org, key: sourceKey });
        return /* await */ putObjectWithVersion(env, daCtx, {
          org: daCtx.org,
          key: Key,
          body: original.body,
          contentLength: original.contentLength,
          type: original.contentType,
        });
      }
      // We're doing a rename

      // TODO when storing the version make sure to do it from the file that was where there before
      // await postObjectVersionWithLabel('Moved', env, daCtx);

      const client = new S3Client(config);
      // This is a move so copy to the new location
      return /* await */ client.send(new CopyObjectCommand(input));
    } else if (e.$metadata.httpStatusCode === 404) {
      return { $metadata: e.$metadata };
    }
    throw e;
  } finally {
    if (Key.endsWith('.html')) {
      // Reset the collab cached state for the copied object
      await invalidateCollab('syncAdmin', `${daCtx.origin}/source/${daCtx.org}/${Key}`, env);
    }
  }
};

export default async function copyObject(env, daCtx, details, isRename) {
  if (details.source === details.destination) return { body: '', status: 409 };

  const config = getS3Config(env);
  const client = new S3Client(config);

  let sourceKeys;
  let remainingKeys = [];
  let continuationToken;

  try {
    if (details.continuationToken) {
      continuationToken = details.continuationToken;
      remainingKeys = await env.DA_JOBS.get(continuationToken, { type: 'json' });
      sourceKeys = remainingKeys.splice(0, MAX_KEYS);
    } else {
      let resp = await listCommand(daCtx, details, client);
      sourceKeys = resp.sourceKeys;
      if (resp.continuationToken) {
        continuationToken = `copy-${details.source}-${details.destination}-${crypto.randomUUID()}`;
        while (resp.continuationToken) {
          resp = await listCommand(daCtx, { continuationToken: resp.continuationToken }, client);
          remainingKeys.push(...resp.sourceKeys);
        }
      }
    }
    await Promise.all(sourceKeys.map(async (key) => {
      await copyFile(config, env, daCtx, key, details, isRename);
    }));

    if (remainingKeys.length) {
      await env.DA_JOBS.put(continuationToken, JSON.stringify(remainingKeys));
      return { body: JSON.stringify({ continuationToken }), status: 206 };
    } else if (continuationToken) {
      await env.DA_JOBS.delete(continuationToken);
    }
    return { status: 204 };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
