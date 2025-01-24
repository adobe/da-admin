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

export async function logout({ daCtx, env }) {
  await Promise.all(daCtx.users.map((u) => env.DA_AUTH.delete(u.ident)));
  return { status: 200 };
}

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

function getIdents(user) {
  return (user.groups || [])
    .flatMap((group) => [
      `${group.orgIdent}`,
      `${group.orgIdent}/${group.groupName}`,
      `${group.orgIdent}/${user.email}`,
    ])
    .concat(user.email)
    .filter((e) => e !== undefined);
}

export function getUserActions(pathLookup, user, target) {
  const idents = getIdents(user);

  const plVals = idents.map((key) => pathLookup.get(key) || []);
  const actions = plVals.map((entries) => entries
    .find(({ path }) => {
      if (path.endsWith('/+**')) return target.startsWith(path.slice(0, -3)) || target === path.slice(0, -4);
      if (target.length < path.length) return false;
      if (path.endsWith('/**')) return target.startsWith(path.slice(0, -2));
      if (target.endsWith('.html')) return target.slice(0, -5) === path || target === path;
      return target === path;
    }))
    .filter((a) => a);

  return {
    actions: new Set(actions.flatMap(({ actions: acts }) => acts)),
    trace: actions,
  };
}

function prepPathForSort(path) {
  if (path.endsWith('/+**')) return path.slice(0, -3);
  if (path.endsWith('/**')) return path.slice(0, -2);
  return path;
}

export function pathSorter({ path: path1 }, { path: path2 }) {
  const sp1 = prepPathForSort(path1);
  const sp2 = prepPathForSort(path2);
  return sp2.length - sp1.length;
}

export async function getAclCtx(env, org, users, key, api) {
  const pathLookup = new Map();

  const props = await env.DA_CONFIG?.get(org, { type: 'json' });

  if (props && props[':type'] === 'sheet' && props[':sheetname'] === 'permissions') {
    // It's a single-sheet, move the data to the right place
    props.permissions = { data: props.data };
  }

  if (!props?.permissions?.data) {
    return {
      pathLookup,
      actionSet: new Set(['read', 'write']),
    };
  }

  const aclTrace = [];
  props.permissions.data.forEach(({ path, groups, actions }) => {
    if (!path || !groups) return;

    // The ACLTRACE keyword is handled specially as its used for every request
    if (path.trim() === 'ACLTRACE' && actions?.includes('read')) {
      groups.split(',').forEach((g) => aclTrace.push(g.trim()));
      return; // Don't add it to the list of paths
    }

    let effectivePath = path.replace(/ /g, '');
    if (effectivePath.endsWith('/') && effectivePath.length > 1) {
      effectivePath = effectivePath.slice(0, -1);
    }

    groups.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0).forEach((group) => {
      if (!pathLookup.has(group)) pathLookup.set(group, []);
      pathLookup
        .get(group)
        .push({
          group,
          path: effectivePath,
          actions: actions
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .flatMap((entry) => (entry === 'write' ? ['read', 'write'] : [entry])),
        });
    });
  });
  pathLookup.forEach((value) => value.sort(pathSorter));

  // Do a lookup for the base key, we always need this info
  let k;
  if (api === 'config') {
    k = 'CONFIG';
  } else {
    k = key.startsWith('/') ? key : `/${key}`;
  }

  const [firstUser, ...otherUsers] = users;
  let actionSet;
  let actionTrace;
  if (firstUser) {
    const fa = getUserActions(pathLookup, firstUser, k);
    actionSet = fa.actions;
    actionTrace = fa.trace;
    otherUsers.forEach((u) => {
      const ua = getUserActions(pathLookup, u, k);
      actionSet = actionSet.intersection(ua.actions);
      ua.trace.forEach((t) => actionTrace.push(t));
    });
  } else {
    actionSet = new Set();
  }

  // Expose the action trace or not?
  actionTrace = users.every((u) => aclTrace.includes(u.email)) ? actionTrace : undefined;

  if (k === 'CONFIG') {
    actionSet.add('read');
  }

  // // TODO maybe we should turn the order around because it's more likely to have read
  // // permission on the content than explicitly on CONFIG

  // // If the user doesn't have read persmissions on config, get them from the content
  // const pathActions =
  //   getAllUserActions(pathLookup, users, key.startsWith('/') ? key : `/${key}`);
  // if (pathActions.actionSet.has('read')) {
  //   actionSet.add('read');
  //   actionTrace = pathActions.actionTrace;
  // }

  return { pathLookup, actionSet, actionTrace };
}

export function getUserChildRules(pathLookup, ident, key) {
  const dk = key.endsWith('/') ? key : `${key}/`;
  const dirKey = dk.startsWith('/') ? dk : `/${dk}`;

  const rules = pathLookup.get(ident) || [];
  const pr1 = rules.filter((r) => r.path.startsWith(dirKey));
  const pr2 = pr1.filter((r) => r.path.lastIndexOf('/') === (dirKey.length - 1));

  const wildcardFound = pr2.some((r) => r.path.endsWith('**'));
  if (!wildcardFound && dirKey.lastIndexOf('/') > 0) {
    // remove last pathsegment from dirkey
    const dirKeyParent = dirKey.substring(0, dirKey.slice(0, -1).lastIndexOf('/')).concat('/');

    const parentRules = getUserChildRules(pathLookup, ident, dirKeyParent);
    const parentWildCardRules = parentRules.filter((r) => r.path.endsWith('**'));
    pr2.push(...parentWildCardRules);
  }
  return pr2;
}

export function getChildRules(daCtx) {
  const storedRules = daCtx.aclCtx.childRules;
  if (storedRules) return;

  const pd = daCtx.key.endsWith('/') ? daCtx.key : daCtx.key.concat('/');
  const probeDir = pd.startsWith('/') ? pd : '/'.concat(pd);
  const probeKey = probeDir.concat('acl.probe');
  const actionSets = [];
  for (const u of daCtx.users) {
    const { actions } = getUserActions(daCtx.aclCtx.pathLookup, u, probeKey);
    actionSets.push(actions);
  }

  let resultSet;
  if (actionSets.length === 0) {
    resultSet = new Set();
  } else {
    resultSet = actionSets.shift();
    for (const as of actionSets) {
      resultSet = resultSet.intersection(as);
    }
  }

  // eslint-disable-next-line no-param-reassign
  daCtx.aclCtx.childRules = [`${probeDir}**=${[...resultSet].join(',')}`];
}

export function hasPermission(daCtx, path, action, keywordPath = false) {
  if (daCtx.aclCtx.pathLookup.size === 0) {
    return true;
  }

  const p = !path.startsWith('/') && !keywordPath ? `/${path}` : path;
  const k = daCtx.key.startsWith('/') ? daCtx.key : `/${daCtx.key}`;

  // is it the path from the context? then return the cached value
  if (k === p) {
    const perm = daCtx.aclCtx.actionSet.has(action);
    if (!perm) {
      // eslint-disable-next-line no-console
      console.log(`User ${daCtx.users.map((u) => u.email)} doesn't have permission to ${action} ${path}`);
    }
    return perm;
  }

  // The path is a sub-path which can happen during bulk operations

  const permission = daCtx.users
    .every((u) => getUserActions(daCtx.aclCtx.pathLookup, u, p).actions.has(action));
  if (!permission && !keywordPath) {
    // eslint-disable-next-line no-console
    console.warn(`User ${daCtx.users.map((u) => u.email)} does not have permission to ${action} ${path}`);
  }
  return permission;
}
