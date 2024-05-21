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
import getS3Config from '../utils/config.js';
import getObject from '../object/get.js';
import { putVersion } from './put.js';

function buildInput({
  org, key, body, type,
}) {
  const Bucket = `${org}-content`;
  return {
    Bucket, Key: key, Body: body, ContentType: type,
  };
}

// Currently only patches the label into the version
export async function patchObjectVersion(req, env, daCtx) {
  const rb = await req.json();
  const { org, key } = daCtx;

  const config = getS3Config(env);
  const update = buildInput(daCtx);
  const current = await getObject(env, { org, key: `.da-versions/${key}` });
  if (current.status === 404) {
    return { status: current.status };
  }
  const resp = await putVersion(config, {
    Bucket: update.Bucket,
    Body: current.body,
    ID: daCtx.site,
    Version: daCtx.name,
    Ext: daCtx.ext,
    Metadata: {
      Users: current.metadata?.users || JSON.stringify([{ email: 'anonymous' }]),
      Timestamp: current.metadata?.timestamp || `${Date.now()}`,
      Path: current.metadata?.path || daCtx.key,
      Label: rb.label || current.metadata?.label,
      ContentLength: current.contentLength,
    },
  }, false);
  return { status: resp.status };
}
