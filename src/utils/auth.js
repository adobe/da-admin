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
import { decodeJwt } from 'jose';

export async function setUser(userId, expiration, headers, env) {
  let resp = await fetch(`${env.IMS_ORIGIN}/ims/profile/v1`, { headers });
  if (!resp.ok) {
    // Something went wrong - either with the connection or the token isn't valid
    // assume we are anon for now (but don't cache so we can try again next time)
    return null;
  }
  const json = await resp.json();

  // Now get the groups of the user
  resp = await fetch(`${env.IMS_ORIGIN}/ims/organizations/v5`, { headers });
  if (!resp.ok) {
    // Something went wrong - either with the connection or the token isn't valid
    // assume we are anon for now (but don't cache so we can try again next time)
    return null;
  }

  const organizationsJson = await resp.json();

  const value = JSON.stringify({
    email: json.email,
    ident: json.userId,
    groups: organizationsJson
      .map(({ orgName, orgRef, groups }) => groups
        .map(({ groupName, groupDisplayName, ident }) => ({
          orgName, orgIdent: orgRef.ident, groupName, groupDisplayName, ident,
        })))
      .flat(),
  });

  await env.DA_AUTH.put(userId, value, { expiration });
  return value;
}

export async function getUsers(req, env) {
  const authHeader = req.headers?.get('authorization');
  if (!authHeader) return [{ email: 'anonymous' }];

  async function parseUser(token) {
    if (!token || token.trim().length === 0) return { email: 'anonymous' };

    const { user_id: userId, created_at: createdAt, expires_in: expiresIn } = decodeJwt(token);
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

// This is somewhat similar to isAuthorized, but the expectation is that
// isAuthorized will disappear at some point
export async function isAdmin(env, org, users) {
  if (!org) return false;
  if (users.length === 0) return false;

  let props = await env.DA_CONFIG.get(org, { type: 'json' });
  if (!props) return false;

  // When the data is a multi-sheet, it's one level deeper
  if (props[':type'] === 'multi-sheet') {
    props = props.data;
  }

  const admins = props.data.reduce((acc, data) => {
    if (data.key === 'admin.role.all') acc.push(data.value.toLowerCase());
    return acc;
  }, []);

  if (!admins || !admins.length) return false;

  for (const u of users) {
    if (!admins.includes(u.email.toLowerCase())) return false;
  }
  return true;
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

  if (!admins || !admins.length) return true;
  return admins.some((admin) => admin.toLowerCase() === user.email.toLowerCase());
}

export function getUserActions(pathLookup, user, target) {
  const idents = (user.groups || [])
    .flatMap((group) => [
      `${group.orgIdent}/${group.ident}`,
      `${group.orgName}/${group.ident}`,
      `${group.orgIdent}/${group.groupName}`,
      `${group.orgName}/${group.groupName}`,
    ])
    .concat(user.ident)
    .concat(user.email);

  const plVals = idents.map((key) => pathLookup.get(key) || []);
  const actions = plVals.map((entries) => entries
    .find(({ path }) => {
      if (path.endsWith('/+*')) return target.startsWith(path.slice(0, -2)) || target === path.slice(0, -3);
      if (target.length < path.length) return false;
      if (path.endsWith('/*')) return target.startsWith(path.slice(0, -1));
      if (target.endsWith('.html')) return target.slice(0, -5) === path;
      return target === path;
    }) || { actions: [] });

  return new Set(actions.flatMap(({ actions: acts }) => acts));
}

export async function getAclCtx(env, org, users, key) {
  const pathLookup = new Map();

  const props = await env.DA_CONFIG?.get(org, { type: 'json' });
  if (!props || !props.permissions.data) {
    return {
      pathLookup,
      actions: ['read', 'write'],
    };
  }

  props.permissions.data.forEach(({ path, groups, actions }) => {
    groups.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0).forEach((group) => {
      if (!pathLookup.has(group)) pathLookup.set(group, []);
      pathLookup
        .get(group)
        .push({
          path,
          actions: actions
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .flatMap((entry) => (entry === 'write' ? ['read', 'write'] : [entry])),
        });
    });
  });
  pathLookup
    .forEach((value) => value
      .sort(({ path: path1 }, { path: path2 }) => path2.length - path1.length));

  // Do a lookup for the base key, we always need this info
  const k = key.startsWith('/') ? key : `/${key}`;
  const actions = users.reduce((acc, u) => acc.concat([...getUserActions(pathLookup, u, k)]), []);

  return { pathLookup, actions };
}

export function hasPermission(daCtx, path, action, keywordPath = false) {
  if (daCtx.aclCtx.pathLookup.size === 0) {
    return true;
  }

  const p = !path.startsWith('/') && !keywordPath ? `/${path}` : path;
  const k = daCtx.key.startsWith('/') ? daCtx.key : `/${daCtx.key}`;

  // is it the path from the context? then return the cached value
  if (k === p) {
    return daCtx.aclCtx.actions.includes(action);
  }

  // The path is a sub-path which can happen during bulk operations

  const permission = daCtx.users
    .every((u) => getUserActions(daCtx.aclCtx.pathLookup, u, p).has(action));
  if (!permission) {
    // eslint-disable-next-line no-console
    console.log(`User ${daCtx.users.map((u) => u.email)} does not have permission to ${action} ${path}`);
  }
  return permission;
}
