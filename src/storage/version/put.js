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
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { EMPTY_DOC_SIZE } from '../../utils/constants.js';
import getS3Config from '../utils/config.js';
import {
  getUsersForMetadata, ifMatch, ifNoneMatch,
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
  Bucket, Org, Body, ID, Version, Ext, Metadata, ContentLength, ContentType,
}, noneMatch = true) {
  const length = ContentLength ?? getContentLength(Body);

  const client = noneMatch ? ifNoneMatch(config) : new S3Client(config);
  const input = {
    Bucket, Key: `${Org}/.da-versions/${ID}/${Version}.${Ext}`, Body, Metadata, ContentLength: length, ContentType,
  };
  const command = new PutObjectCommand(input);
  try {
    const resp = await client.send(command);
    return { status: resp.$metadata.httpStatusCode };
  } catch (e) {
    const status = e.$metadata?.httpStatusCode || 500;
    // eslint-disable-next-line no-console
    if (status >= 500) console.error('Fail to put version', e);
    return { status };
  }
}

function buildInput({
  bucket, org, key, body, type, contentLength,
}) {
  const length = contentLength ?? getContentLength(body);

  const Bucket = bucket;
  return {
    Bucket, Key: `${org}/${key}`, Body: body, ContentType: type, ContentLength: length,
  };
}

export async function putObjectWithVersion(
  env,
  daCtx,
  update,
  body,
  guid,
  clientConditionals = null,
) {
  const config = getS3Config(env);
  // While we are automatically storing the body once for the 'Collab Parse' changes, we never
  // do a HEAD, because we may need the content. Once we don't need to do this automatic store
  // any more, we can change the 'false' argument in the next line back to !body.
  const current = await getObject(env, update, false);

  let ID = current.metadata?.id;
  if (!ID) {
    ID = guid || crypto.randomUUID();
  } else if (guid && ID !== guid) {
    return { status: 409, metadata: { id: ID } };
  }

  const Version = current.metadata?.version || crypto.randomUUID();
  const Users = JSON.stringify(getUsersForMetadata(daCtx.users));
  const input = buildInput(update);
  const Timestamp = `${Date.now()}`;
  const Path = update.key;

  // Validate conflicting conditionals - both headers present is unusual for PUT
  let effectiveConditionals = clientConditionals;
  if (clientConditionals?.ifMatch && clientConditionals?.ifNoneMatch) {
    // Per RFC 7232, If-Match should be evaluated first for PUT/POST
    // If-None-Match for PUT is less common (create-only semantics)
    // eslint-disable-next-line no-console
    console.warn('Both If-Match and If-None-Match provided, prioritizing If-Match per RFC 7232');
    // Clear If-None-Match to prevent confusion
    effectiveConditionals = { ifMatch: clientConditionals.ifMatch };
  }

  // Handle client-provided If-Match: * (requires resource to exist)
  if (effectiveConditionals?.ifMatch === '*') {
    if (current.status === 404) {
      return { status: 412, metadata: { id: ID } };
    }
    // Resource exists, proceed with update using actual ETag
    // Fall through to update logic below with current.etag
  }

  // Handle client-provided If-None-Match: * (requires resource NOT to exist)
  if (effectiveConditionals?.ifNoneMatch === '*') {
    if (current.status !== 404) {
      return { status: 412, metadata: { id: ID } };
    }
    // Resource doesn't exist, proceed with create
    // Fall through to create logic below
  }

  if (current.status === 404) {
    // Use client conditional if provided, otherwise use internal If-None-Match: *
    const client = effectiveConditionals?.ifNoneMatch
      ? ifNoneMatch(config, effectiveConditionals.ifNoneMatch)
      : ifNoneMatch(config);
    const command = new PutObjectCommand({
      ...input,
      Metadata: {
        ID, Version, Users, Timestamp, Path,
      },
    });
    try {
      const resp = await client.send(command);
      return resp.$metadata.httpStatusCode === 200
        ? { status: 201, metadata: { id: ID }, etag: resp.ETag }
        : { status: resp.$metadata.httpStatusCode, metadata: { id: ID }, etag: resp.ETag };
    } catch (e) {
      const status = e.$metadata?.httpStatusCode || 500;
      if (status === 412) {
        // Only retry if no client conditionals (internal operation) and under retry limit
        if (!effectiveConditionals?.ifNoneMatch) {
          return putObjectWithVersion(
            env,
            daCtx,
            update,
            body,
            guid,
            clientConditionals,
          );
        }
        // Client conditional failed or max retries exceeded, return 412
        return { status: 412, metadata: { id: ID } };
      }

      // eslint-disable-next-line no-console
      if (status >= 500) console.error('Failed to put object (in object with version)', e);
      return { status, metadata: { id: ID } };
    }
  }

  const pps = current.metadata?.preparsingstore || '0';

  // Store the body if preparsingstore is not defined, so a once-off store
  let storeBody = !body && pps === '0';
  const Preparsingstore = storeBody ? Timestamp : pps;
  let Label = storeBody ? 'Collab Parse' : update.label;

  if (daCtx.method === 'PUT'
    && daCtx.ext === 'html'
    && current.contentLength > EMPTY_DOC_SIZE
    && (!update.body || update.body.size <= EMPTY_DOC_SIZE)) {
    // we are about to empty the document body
    // this should almost never happen but it does in some unexpectedcases
    // we want then to store a version of the full document as a Restore Point
    // eslint-disable-next-line no-console
    console.warn(`Empty body, creating a restore point (${current.contentLength} / ${update.body?.size})`);
    storeBody = true;
    Label = 'Restore Point';
  }

  const versionResp = await putVersion(config, {
    Bucket: input.Bucket,
    Org: daCtx.org,
    Body: (body || storeBody ? current.body : ''),
    ContentLength: (body || storeBody ? current.contentLength : undefined),
    ContentType: current.contentType,
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
    return { status: versionResp.status, metadata: { id: ID } };
  }

  // Use client-provided If-Match if available, otherwise use current ETag
  // Special case: If client sent If-Match:*, we already validated existence above,
  // so now use the actual ETag for proper version control
  let matchValue;
  if (effectiveConditionals?.ifMatch === '*') {
    matchValue = `${current.etag}`;
  } else {
    matchValue = effectiveConditionals?.ifMatch || `${current.etag}`;
  }
  const client = ifMatch(config, matchValue);
  const command = new PutObjectCommand({
    ...input,
    Metadata: {
      ID, Version: crypto.randomUUID(), Users, Timestamp, Path, Preparsingstore,
    },
  });
  try {
    const resp = await client.send(command);

    return {
      status: resp.$metadata.httpStatusCode,
      metadata: { id: ID },
      etag: resp.ETag,
    };
  } catch (e) {
    const status = e.$metadata?.httpStatusCode || 500;
    if (status === 412) {
      // Only retry if no client conditionals (internal operation) and under retry limit
      if (!effectiveConditionals?.ifMatch) {
        return putObjectWithVersion(
          env,
          daCtx,
          update,
          body,
          guid,
          clientConditionals,
        );
      }
      // Client conditional failed or max retries exceeded, return 412
      return { status: 412, metadata: { id: ID } };
    }

    // eslint-disable-next-line no-console
    if (status >= 500) console.error('Failed to version (in object with version)', e);
    return { status, metadata: { id: ID } };
  }
}

export async function postObjectVersionWithLabel(label, env, daCtx) {
  const { body, contentLength, contentType } = await getObject(env, daCtx);
  const { bucket, org, key } = daCtx;

  const resp = await putObjectWithVersion(env, daCtx, {
    bucket, org, key, body, contentLength, type: contentType, label,
  }, true);

  return { status: resp.status === 200 ? 201 : resp.status };
}

export async function postObjectVersion(req, env, daCtx) {
  let reqJSON;
  try {
    reqJSON = await req.json();
  } catch (e) {
    // no body
  }
  const label = reqJSON?.label;
  return /* await */ postObjectVersionWithLabel(label, env, daCtx);
}
