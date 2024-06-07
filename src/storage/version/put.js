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

function buildInput({
  org, key, body, type, contentLength,
}) {
  const length = contentLength ?? getContentLength(body);

  const Bucket = `${org}-content`;
  return {
    Bucket, Key: key, Body: body, ContentType: type, ContentLength: length,
  };
}

export async function putObjectWithVersion(env, daCtx, update, body) {
  const config = getS3Config(env);
  // While we are automatically storing the body once for the 'Collab Parse' changes, we never
  // do a HEAD, because we may need the content. Once we don't need to do this automatic store
  // any more, we can change the 'false' argument in the next line back to !body.
  const current = await getObject(env, update, false);

  const ID = current.metadata?.id || crypto.randomUUID();
  const Version = current.metadata?.version || crypto.randomUUID();
  const Users = JSON.stringify(daCtx.users);
  const input = buildInput(update);
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
        return putObjectWithVersion(env, daCtx, update, body);
      }
      return e.$metadata.httpStatusCode;
    }
  }

  const pps = current.metadata?.preparsingstore || '0';

  // Store the body if preparsingstore is not defined, so a once-off store
  const storeBody = !body && pps === '0';
  const Preparsingstore = storeBody ? Timestamp : pps;
  const Label = storeBody ? 'Collab Parse' : update.label;

  const versionResp = await putVersion(config, {
    Bucket: input.Bucket,
    Body: (body || storeBody ? current.body : ''),
    ContentLength: (body || storeBody ? current.contentLength : undefined),
    ID,
    Version,
    Ext: daCtx.ext,
    Metadata: {
      Users: current.metadata?.users || JSON.stringify([{ email: 'anonymous' }]),
      Timestamp: current.metadata?.timestamp || Timestamp,
      Path: current.metadata?.path || Path,
      Label,
    },
  });

  if (versionResp.status !== 200 && versionResp.status !== 412) {
    return versionResp.status;
  }

  const client = ifMatch(config, `${current.etag}`);
  const command = new PutObjectCommand({
    ...input,
    Metadata: {
      ID, Version: crypto.randomUUID(), Users, Timestamp, Path, Preparsingstore,
    },
  });
  try {
    const resp = await client.send(command);

    return resp.$metadata.httpStatusCode;
  } catch (e) {
    if (e.$metadata.httpStatusCode === 412) {
      return putObjectWithVersion(env, daCtx, update, body);
    }
    return e.$metadata.httpStatusCode;
  }
}

export async function postObjectVersion(req, env, daCtx) {
  let reqJSON;
  try {
    reqJSON = await req.json();
  } catch (e) {
    // no body
  }
  const label = reqJSON?.label;

  const { body, contentLength, contentType } = await getObject(env, daCtx);
  const { org, key } = daCtx;

  const resp = await putObjectWithVersion(env, daCtx, {
    org, key, body, contentLength, type: contentType, label,
  }, true);

  return { status: resp === 200 ? 201 : resp };
}
