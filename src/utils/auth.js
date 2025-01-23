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
import { createRemoteJWKSet, jwtVerify, jwksCache } from 'jose';

export async function setUser(userId, expiration, headers, env) {
  const resp = await fetch(`${env.IMS_ORIGIN}/ims/profile/v1`, { headers });
  if (!resp.ok) {
    // Something went wrong - either with the connection or the token isn't valid
    // assume we are anon for now (but don't cache so we can try again next time)
    return null;
  }
  const json = await resp.json();

  const value = JSON.stringify({ email: json.email });
  await env.DA_AUTH.put(userId, value, { expiration });
  return value;
}

/**
 * Retrieve cached IMS keys from KV Store
 * @param {*} env
 * @param {string} keysUrl
 * @returns {Promise<import('jose').ExportedJWKSCache>}
 */
async function getPreviouslyCachedJWKS(env, keysUrl) {
  const cachedJwks = await env.DA_AUTH.get(keysUrl);
  if (!cachedJwks) return {};

  return JSON.parse(cachedJwks);
}

/**
 * Store new set of IMS keys in the KV Store
 * @param {*} env
 * @param {string} keysUrl
 * @param {import('jose').ExportedJWKSCache} keysCache
 * @returns {Promise<void>}
 */
async function storeJWSInCache(env, keysUrl, keysCache) {
  try {
    await env.DA_AUTH.put(
      keysUrl,
      JSON.stringify(keysCache),
      {
        expirationTtl: 24 * 60 * 60, // 24 hours in seconds
      },
    );
  } catch (err) {
    // An error may be thrown if a write to the same key is made within 1 second
    // eslint-disable-next-line no-console
    console.error('Failed to store keys in cache', err); 
  }
}

export async function getUsers(req, env) {
  const authHeader = req.headers?.get('authorization');
  if (!authHeader) return [{ email: 'anonymous' }];

  async function parseUser(token) {
    if (!token || token.trim().length === 0) return { email: 'anonymous' };

    let payload;
    try {
      const keysURL = `${env.IMS_ORIGIN}/ims/keys`;

      const keysCache = await getPreviouslyCachedJWKS(env, keysURL);
      const { uat } = keysCache;

      const jwks = createRemoteJWKSet(
        new URL(keysURL),
        {
          [jwksCache]: keysCache,
          cacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        },
      );

      ({ payload } = await jwtVerify(token, jwks));

      if (uat !== keysCache.uat) {
        await storeJWSInCache(env, keysURL, keysCache);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('IMS token offline verification failed', e);
      return { email: 'anonymous' };
    }

    if (!payload) return { email: 'anonymous' };

    const { user_id: userId, created_at: createdAt, expires_in: expiresIn } = payload;
    const expires = Number(createdAt) + Number(expiresIn);
    const now = Math.floor(new Date().getTime() / 1000);

    if (expires < now) return { email: 'anonymous' };
    // Find the user in recent sessions
    let user = await env.DA_AUTH.get(userId);

    // If not found, add them to recent sessions
    if (!user) {
      const headers = new Headers(req.headers);
      headers.delete('authorization');
      headers.set('authorization', `Bearer ${token}`);
      // If not found, create them
      user = await setUser(userId, Math.floor(expires / 1000), headers, env);
    }

    // If there's still no user, make them anon.
    if (!user) return { email: 'anonymous' };

    // Finally, return whoever was made.
    return JSON.parse(user);
  }

  return Promise.all(
    authHeader.split(',')
      .map((auth) => auth.split(' ').pop())
      .map(parseUser),
  );
}

export async function isAuthorized(env, org, user) {
  if (!org) return true;

  let props = await env.DA_CONFIG.get(org, { type: 'json' });
  if (!props) return true;

  // When the data is a multi-sheet, it's one level deeper
  if (props[':type'] === 'multi-sheet') {
    props = props.data;
  }

  const admins = props.data.reduce((acc, data) => {
    if (data.key === 'admin.role.all') acc.push(data.value);
    return acc;
  }, []);

  if (!admins) return true;
  return admins.some((admin) => admin.toLowerCase() === user.email.toLowerCase());
}
