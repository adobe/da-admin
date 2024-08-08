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

const NO_DEST_ERROR = {
  body: JSON.stringify({ error: 'No destination provided.' }),
  status: 400,
};

const NO_PARENT_ERROR = {
  body: JSON.stringify({ error: 'Destination cannot be descendent of source.' }),
  status: 400,
};

export default async function moveHelper(req, daCtx) {
  try {
    const formData = await req.formData();
    if (!formData) return {};
    const fullDest = formData.get('destination');
    if (!fullDest) return { error: NO_DEST_ERROR };
    const lower = fullDest.slice(1).toLowerCase();
    const sanitized = lower.endsWith('/') ? lower.slice(0, -1) : lower;
    let destination = sanitized.split('/').slice(1).join('/');
    const source = daCtx.key;

    // Ensure destination is not child of source
    if (destination.startsWith(`${source}/`)) {
      return { error: NO_PARENT_ERROR };
    }

    // Timestamp if the names are the same
    if (destination === source) {
      destination = `${source}-${Date.now()}`;
    }

    return { source, destination };
  } catch {
    return { error: NO_DEST_ERROR };
  }
}
