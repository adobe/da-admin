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
export default async function copyHelper(req, daCtx) {
  const formData = await req.formData();
  if (!formData) return {};
  const fullDest = formData.get('destination');
  const continuationToken = formData.get('continuation-token');
  const lower = fullDest.slice(1).toLowerCase();
  const sanitized = lower.endsWith('/') ? lower.slice(0, -1) : lower;
  const destination = sanitized.split('/').slice(1).join('/');
  const source = daCtx.key;
  return { source, destination, continuationToken };
}
