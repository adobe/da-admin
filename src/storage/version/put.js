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
import {
  createBucketIfMissing, ifMatch, ifNoneMatch,
} from '../utils/version.js';
import getObject from '../object/get.js';

export function getContentLength(body) {
  if (body === undefined) {
    return undefined;
  }

  if (typeof body === 'string' || body instanceof String) {
    // get string length in bytes
    return new Blob([body]).size;
  } else if (body instanceof File) {
    return body.size;
  }
  return undefined;
}

export async function putVersion(config, {
  Bucket, Body, ID, Version, Ext, Metadata, ContentLength,
}, noneMatch = true) {
  const length = ContentLength ?? getContentLength(Body);

  const client = noneMatch ? ifNoneMatch(config) : createBucketIfMissing(new S3Client(config));
  const input = {
    Bucket, Key: `.da-versions/${ID}/${Version}.${Ext}`, Body, Metadata, ContentLength: length,
  };
  const command = new PutObjectCommand(input);
  try {
    const resp = await client.send(command);
    return { status: resp.$metadata.httpStatusCode };
  } catch (e) {
    return { status: e.$metadata.httpStatusCode };
  }
}

async function buildInput({
  org, key, body, type,
}) {
  const length = getContentLength(body);

  const Bucket = `${org}-content`;
  return {
    Bucket, Key: key, Body: body, ContentType: type, ContentLength: length,
  };
}

export async function postObjectVersion(req, env, daCtx) {
  let reqJSON;
  try {
    reqJSON = await req.json();
  } catch (e) {
    // no label
  }

  const config = getS3Config(env);
  const update = await buildInput(daCtx);
  const current = await getObject(env, daCtx);
  if (current.status === 404 || !current.metadata?.id || !current.metadata?.version) {
    return 404;
  }

  let existingVersion;
  if (reqJSON?.label === undefined) {
    existingVersion = await getObject(env, {
      org: daCtx.org,
      key: `.da-versions/${current.metadata.id}/${current.metadata.version}.${daCtx.ext}`,
    });
  }
  const label = reqJSON?.label || existingVersion?.metadata?.label;

  const resp = await putVersion(config, {
    Bucket: update.Bucket,
    Body: current.body,
    ContentLength: current.contentLength,
    ID: current.metadata.id,
    Version: current.metadata.version,
    Ext: daCtx.ext,
    Metadata: {
      Users: current.metadata?.users || JSON.stringify([{ email: 'anonymous' }]),
      Timestamp: current.metadata?.timestamp || `${Date.now()}`,
      Path: current.metadata?.path || daCtx.key,
      Label: label,
    },
  }, false);
  return { status: resp.status === 200 ? 201 : resp.status };
}

export async function putObjectWithVersion(env, daCtx, update, body) {
  const config = getS3Config(env);
  const current = await getObject(env, update, !body);

  const ID = current.metadata?.id || crypto.randomUUID();
  const Version = current.metadata?.version || crypto.randomUUID();
  const Users = JSON.stringify(daCtx.users);
  const input = await buildInput(update);
  const Timestamp = `${Date.now()}`;
  const Path = update.key;
  if (current.status === 404) {
    const client = ifNoneMatch(config);
    const command = new PutObjectCommand({
      ...input,
      Metadata: {
        ID, Version, Users, Timestamp, Path,
      },
    });
    try {
      const resp = await client.send(command);
      return resp.$metadata.httpStatusCode === 200 ? 201 : resp.$metadata.httpStatusCode;
    } catch (e) {
      if (e.$metadata.httpStatusCode === 412) {
        return putObjectWithVersion(config, update, body);
      }
      return e.$metadata.httpStatusCode;
    }
  }

  const versionResp = await putVersion(config, {
    Bucket: input.Bucket,
    Body: current.body,
    ContentLength: body ? current.contentLength : undefined,
    ID,
    Version,
    Ext: daCtx.ext,
    Metadata: {
      Users: current.metadata?.users || JSON.stringify([{ email: 'anonymous' }]),
      Timestamp: current.metadata?.timestamp || Timestamp,
      Path: current.metadata?.path || Path,
    },
  });

  if (versionResp.status !== 200 && versionResp.status !== 412) {
    return versionResp.status;
  }

  const client = ifMatch(config, `${current.etag}`);
  const command = new PutObjectCommand({
    ...input,
    Metadata: {
      ID, Version: crypto.randomUUID(), Users, Timestamp, Path,
    },
  });
  try {
    const resp = await client.send(command);

    return resp.$metadata.httpStatusCode;
  } catch (e) {
    if (e.$metadata.httpStatusCode === 412) {
      return putObjectWithVersion(env, update, body);
    }
    return e.$metadata.httpStatusCode;
  }
}
