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
import {
  S3Client,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

import getObject from './get.js';
import { notifyCollab } from '../utils/object.js';
import { putObjectWithVersion } from '../version/put.js';
import { getUsersForMetadata } from '../utils/version.js';
import { hasPermission } from '../../utils/auth.js';

export const copyFile = async (config, env, daCtx, sourceKey, details, isRename) => {
  if (!sourceKey || sourceKey.includes('//')) {
    return { $metadata: { httpStatusCode: 400 } };
  }

  const Key = sourceKey.replace(details.source, details.destination);

  if (!hasPermission(daCtx, sourceKey, 'read') || !hasPermission(daCtx, Key, 'write')) {
    return {
      $metadata: {
        httpStatusCode: 403,
      },
    };
  }

  const source = await getObject(env, {
    bucket: daCtx.bucket,
    org: daCtx.org,
    key: sourceKey,
  }, true);

  // Skip if source doesn't exist (e.g., it's a folder without an actual object)
  if (source?.status === 404) {
    return { $metadata: { httpStatusCode: 404 } };
  }

  const input = {
    Bucket: daCtx.bucket,
    Key: `${daCtx.org}/${Key}`,
    CopySource: `${daCtx.bucket}/${daCtx.org}/${encodeURI(sourceKey)}`,
    ContentType: source?.contentType || 'application/octet-stream',
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
      Users: JSON.stringify(getUsersForMetadata(daCtx.users)),
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
    if (e.$metadata?.httpStatusCode === 412) {
      // Not the happy path - something is at the destination already.
      if (!isRename) {
        // This is a copy so just put the source into the target to keep the history.

        const original = await getObject(
          env,
          { bucket: daCtx.bucket, org: daCtx.org, key: sourceKey },
        );
        return /* await */ putObjectWithVersion(env, daCtx, {
          bucket: daCtx.bucket,
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
    } else if (e.$metadata?.httpStatusCode === 404) {
      return { $metadata: e.$metadata };
    }
    throw e;
  } finally {
    if (Key.endsWith('.html')) {
      try {
        await notifyCollab('syncadmin', `${daCtx.origin}/source/${daCtx.org}/${Key}`, env);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to notify collab', e);
      }
    }
  }
};
