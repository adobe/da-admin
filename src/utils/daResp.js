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
export default function daResp({
  status,
  body,
  contentType = 'application/json',
  contentLength,
  metadata,
}, ctx) {
  const headers = new Headers();
  headers.append('Access-Control-Allow-Origin', '*');
  headers.append('Access-Control-Allow-Methods', 'HEAD, GET, PUT, POST, DELETE');
  headers.append('Access-Control-Allow-Headers', '*');
  headers.append('Access-Control-Expose-Headers', 'X-da-actions, X-da-child-actions, X-da-acltrace, X-da-id');
  headers.append('Content-Type', contentType);
  if (contentLength) {
    headers.append('Content-Length', contentLength);
  }
  if (metadata?.id) {
    headers.append('X-da-id', metadata.id);
  }

  if (metadata?.timestamp) {
    headers.append('Last-Modified', new Date(parseInt(metadata.timestamp, 10)).toUTCString());
  }

  if (ctx?.aclCtx && status < 500) {
    headers.append('X-da-actions', `/${ctx.key}=${[...ctx.aclCtx.actionSet]}`);

    if (ctx.aclCtx.childRules) {
      headers.append('X-da-child-actions', ctx.aclCtx.childRules.join(';'));
    }
    if (ctx.aclCtx.actionTrace) {
      headers.append('X-da-acltrace', JSON.stringify(ctx.aclCtx.actionTrace));
    }
  }

  return new Response(body, { status, headers });
}
