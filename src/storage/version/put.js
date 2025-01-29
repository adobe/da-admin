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
import getObject from '../object/get.js';

export async function putVersion(env, {
  Bucket, Body, ID, Version, Ext, Metadata, ContentType,
}, noneMatch = true) {
  const onlyIf = noneMatch ? { etagMatches: '*' } : undefined;
  const r2o = await env.DA_CONTENT.put(
    `${Bucket}/.da-versions/${ID}/${Version}.${Ext}`,
    Body,
    { onlyIf, customMetadata: Metadata, httpMetadata: { contentType: ContentType } },
  );
  if (r2o) {
    return { status: 200 };
  }
  return { status: 412 };
}

export async function putObjectWithVersion(env, daCtx, update, body) {
  // While we are automatically storing the body once for the 'Collab Parse' changes, we never
  // do a HEAD, because we may need the content. Once we don't need to do this automatic store
  // any more, we can change the 'false' argument in the next line back to !body.
  const current = await getObject(env, update, false);

  const ID = current.metadata?.id || crypto.randomUUID();
  const Version = current.metadata?.version || crypto.randomUUID();
  const Users = JSON.stringify(daCtx.users);
  const Timestamp = `${Date.now()}`;
  const Path = update.key;

  if (current.status === 404) {
    const customMetadata = {
      ID, Version, Users, Timestamp, Path,
    };
    const onlyIf = { etagDoesNotMatch: '*' };
    const r2o = await env.DA_CONTENT.put(
      `${daCtx.org}/${update.key}`,
      update.body,
      { onlyIf, httpMetadata: { contentType: update.type }, customMetadata },
    );
    if (!r2o) {
      return putObjectWithVersion(env, daCtx, update, body);
    }
    return 201;
  }

  const pps = current.metadata?.preparsingstore || '0';

  // Store the body if preparsingstore is not defined, so a once-off store
  const storeBody = !body && pps === '0';
  const Preparsingstore = storeBody ? Timestamp : pps;
  const Label = storeBody ? 'Collab Parse' : update.label;

  const versionResp = await putVersion(env, {
    Bucket: update.org,
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

  const onlyIf = { etagMatches: `${current.etag}` };
  const r2o = await env.DA_CONTENT.put(
    `${daCtx.org}/${update.key}`,
    update.body,
    {
      onlyIf,
      customMetadata: {
        ID, Version: crypto.randomUUID(), Users, Timestamp, Path, Preparsingstore,
      },
      httpMetadata: { contentType: update.type },
    },
  );

  if (!r2o) {
    return putObjectWithVersion(env, daCtx, update, body);
  }
  return 200;
}

export async function postObjectVersionWithLabel(label, env, daCtx) {
  const { body, contentLength, contentType } = await getObject(env, daCtx);
  const { org, key } = daCtx;

  const resp = await putObjectWithVersion(env, daCtx, {
    org, key, body, contentLength, type: contentType, label,
  }, true);

  return { status: resp === 200 ? 201 : resp };
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
