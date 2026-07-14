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
const NO_DEST_ERROR = {
  body: JSON.stringify({ error: 'No destination provided.' }),
  status: 400,
};

const BAD_CONTENT_TYPE_ERROR = {
  body: JSON.stringify({ error: 'Invalid Content-Type. Expected multipart/form-data or application/x-www-form-urlencoded.' }),
  status: 400,
};

const CROSS_ORG_ERROR = {
  body: JSON.stringify({ error: 'Destination must be in the same org as the source.' }),
  status: 400,
};

export default async function copyHelper(req, daCtx) {
  let formData;
  try {
    formData = await req.formData();
  } catch {
    return { error: BAD_CONTENT_TYPE_ERROR };
  }
  if (!formData) return {};
  const fullDest = formData.get('destination');
  if (!fullDest) return { error: NO_DEST_ERROR };
  const continuationToken = formData.get('continuation-token');
  const lower = fullDest.slice(1).toLowerCase();
  const sanitized = lower.endsWith('/') ? lower.slice(0, -1) : lower;

  // Reject cross-org destinations
  const [destOrg, ...destParts] = sanitized.split('/');
  if (destOrg !== daCtx.org) return { error: CROSS_ORG_ERROR };

  const destination = destParts.join('/');
  const source = daCtx.key;
  return { source, destination, continuationToken };
}
