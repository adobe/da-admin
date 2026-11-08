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
import { connectOrg, disconnectOrg, isConnected } from '../utils/directory.js';

const json = (status, body) => ({ status, body: JSON.stringify(body) });

const callerOrgs = (daCtx) => daCtx.users.flatMap((user) => user.orgs ?? []);

function findCallerOrg(daCtx) {
  return callerOrgs(daCtx).find((org) => org.orgIdent?.toLowerCase() === daCtx.org);
}

const isOrgPath = (daCtx) => Boolean(daCtx.org) && !daCtx.key;

export async function getImsOrgs({ env, daCtx }) {
  if (daCtx.org) return undefined;
  const orgs = new Map();
  callerOrgs(daCtx).forEach((org) => {
    if (org.orgIdent) orgs.set(org.orgIdent.toLowerCase(), org);
  });
  const list = await Promise.all([...orgs.values()].map(async ({ orgIdent, orgName }) => ({
    orgIdent,
    orgName,
    connected: await isConnected(env, orgIdent),
  })));
  list.sort((a, b) => (a.orgName ?? '').localeCompare(b.orgName ?? ''));
  return json(200, { orgs: list });
}

export async function postImsOrg({ req, env, daCtx }) {
  if (!isOrgPath(daCtx)) return undefined;
  const org = findCallerOrg(daCtx);
  if (!org) return { status: 403 };

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : '';
  const clientSecret = typeof body?.clientSecret === 'string' ? body.clientSecret.trim() : '';
  if (!clientId || !clientSecret) return json(400, { error: 'missing_credentials' });

  try {
    const result = await connectOrg(env, org.orgIdent, { clientId, clientSecret });
    return json(result.error ? 400 : 200, result);
  } catch (e) {
    console.error('IMS org connect failed', e.message);
    return { status: 502, error: 'directory unavailable' };
  }
}

export async function deleteImsOrg({ env, daCtx }) {
  if (!isOrgPath(daCtx)) return undefined;
  const org = findCallerOrg(daCtx);
  if (!org) return { status: 403 };
  await disconnectOrg(env, org.orgIdent);
  return json(200, { connected: false });
}
