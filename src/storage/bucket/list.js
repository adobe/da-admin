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
import { isAuthorized } from '../../utils/auth.js';

async function isBucketAuthed(env, daCtx, bucket) {
  const { name, created } = bucket;
  const userAuth = await Promise.all(
    daCtx.users.map(async (user) => isAuthorized(env, name, user)),
  );
  const notAuthed = userAuth.some((authed) => !authed);
  if (notAuthed) return null;
  return { name, created };
}

async function formatBuckets(env, daCtx, buckets) {
  const authResults = await Promise.all(
    buckets.map((bucket) => isBucketAuthed(env, daCtx, bucket)),
  );
  return authResults.filter((res) => res);
}

export default async function listBuckets(env, daCtx) {
  try {
    const orgs = await env.DA_AUTH.get('orgs', { type: 'json' });
    const body = await formatBuckets(env, daCtx, orgs);

    return {
      body: JSON.stringify(body),
      status: 200,
      contentType: 'application/json',
    };
  } catch (e) {
    return { body: '', status: 404 };
  }
}
