/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { seal, unseal } from './secret-box.js';

const USERS_TTL = 15 * 60;
const NOT_CONNECTED_TTL = 10 * 60;
const TOKEN_EXPIRY_MARGIN = 5 * 60;
const MAX_PAGES = 500;
const SCOPES = 'openid,AdobeID,user_management_sdk';
const DEFAULT_UMAPI_ORIGIN = 'https://usermanagement.adobe.io';

export class DirectoryNotConnected extends Error {}

const credKey = (orgIdent) => `directory-cred:${orgIdent}`;
const tokenKey = (orgIdent) => `directory-token:${orgIdent}`;
const offKey = (orgIdent) => `directory-off:${orgIdent}`;
const usersKey = (orgIdent) => `org-users:${orgIdent}`;

const fullOrgId = (orgIdent) => (orgIdent.includes('@') ? orgIdent : `${orgIdent}@AdobeOrg`);

async function readCredential(env, orgIdent) {
  const sealed = await env.DA_AUTH.get(credKey(orgIdent));
  return sealed ? unseal(env.DIRECTORY_ENCRYPTION_KEY, sealed) : null;
}

function requestToken(env, { clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPES,
  });
  return fetch(`${env.IMS_ORIGIN}/ims/token/v3`, { method: 'POST', body });
}

function fetchUsersPage(env, { clientId }, token, orgIdent, page) {
  const origin = env.UMAPI_ORIGIN || DEFAULT_UMAPI_ORIGIN;
  // directOnly=false includes profiles inherited through user groups, as DA permission checks do
  const url = `${origin}/v2/usermanagement/users/${fullOrgId(orgIdent)}/${page}?directOnly=false`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Api-Key': clientId } });
}

async function readToken(resp) {
  const { access_token: token, expires_in: expiresIn } = await resp.json();
  return { token, expirationTtl: Math.max(60, expiresIn - TOKEN_EXPIRY_MARGIN) };
}

async function getOrgToken(env, orgIdent, credential) {
  const [cached, off] = await Promise.all([
    env.DA_AUTH.get(tokenKey(orgIdent)),
    env.DA_AUTH.get(offKey(orgIdent)),
  ]);
  if (cached) return cached;
  if (off) throw new DirectoryNotConnected(orgIdent);

  const resp = await requestToken(env, credential);
  if (resp.status >= 400 && resp.status < 500) {
    await env.DA_AUTH.put(offKey(orgIdent), '1', { expirationTtl: NOT_CONNECTED_TTL });
    throw new DirectoryNotConnected(orgIdent);
  }
  if (!resp.ok) throw new Error(`directory token ${resp.status}`);
  const { token, expirationTtl } = await readToken(resp);
  await env.DA_AUTH.put(tokenKey(orgIdent), token, { expirationTtl });
  return token;
}

function toUser({
  email, firstname, lastname, groups,
}) {
  const name = [firstname, lastname].filter(Boolean).join(' ') || email;
  return { email, name, groups: groups ?? [] };
}

async function fetchOrgUsers(env, orgIdent) {
  const credential = await readCredential(env, orgIdent);
  if (!credential) throw new DirectoryNotConnected(orgIdent);
  const token = await getOrgToken(env, orgIdent, credential);

  const users = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchUsersPage(env, credential, token, orgIdent, page);
    if (!resp.ok) throw new Error(`directory ${resp.status}`);
    // eslint-disable-next-line no-await-in-loop
    const json = await resp.json();
    users.push(...(json.users ?? []).map(toUser));
    if (json.lastPage !== false) break;
  }
  return users;
}

export async function getOrgUsers(env, orgIdent) {
  const cached = await env.DA_AUTH.get(usersKey(orgIdent), { type: 'json' });
  if (cached) return cached;

  const users = await fetchOrgUsers(env, orgIdent);
  await env.DA_AUTH.put(usersKey(orgIdent), JSON.stringify(users), { expirationTtl: USERS_TTL });
  return users;
}

export async function isConnected(env, orgIdent) {
  const [cred, off] = await Promise.all([
    env.DA_AUTH.get(credKey(orgIdent)),
    env.DA_AUTH.get(offKey(orgIdent)),
  ]);
  return Boolean(cred) && !off;
}

// Only a credential created in this org's Developer Console can list its users,
// so a successful read is the proof of authority to connect it.
export async function connectOrg(env, orgIdent, credential) {
  const tokenResp = await requestToken(env, credential);
  if (tokenResp.status >= 400 && tokenResp.status < 500) return { error: 'invalid_credentials' };
  if (!tokenResp.ok) throw new Error(`directory token ${tokenResp.status}`);
  const { token, expirationTtl } = await readToken(tokenResp);

  const usersResp = await fetchUsersPage(env, credential, token, orgIdent, 0);
  if (usersResp.status >= 400 && usersResp.status < 500) return { error: 'wrong_org' };
  if (!usersResp.ok) throw new Error(`directory ${usersResp.status}`);

  const sealed = await seal(env.DIRECTORY_ENCRYPTION_KEY, credential);
  await env.DA_AUTH.put(credKey(orgIdent), sealed);
  await Promise.all([
    env.DA_AUTH.delete(offKey(orgIdent)),
    env.DA_AUTH.delete(usersKey(orgIdent)),
    env.DA_AUTH.put(tokenKey(orgIdent), token, { expirationTtl }),
  ]);
  return { connected: true };
}

export async function disconnectOrg(env, orgIdent) {
  const keys = [credKey, tokenKey, offKey, usersKey].map((key) => key(orgIdent));
  await Promise.all(keys.map((key) => env.DA_AUTH.delete(key)));
}
