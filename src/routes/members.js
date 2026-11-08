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
import { pathMatches } from '../utils/auth.js';
import { getOrgUsers, DirectoryNotConnected } from '../utils/directory.js';

const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

const isTechnicalAccount = (email) => email.endsWith('@techacct.adobe.com');

function grantsRead(entries, target) {
  const rule = entries.find(({ path }) => pathMatches(path, target));
  return rule?.actions.includes('read') ?? false;
}

export default async function getMembers({ env, daCtx }) {
  const target = `/${daCtx.key}`;
  const opsOrg = env.DA_OPS_IMS_ORG?.toLowerCase();
  const callerOrgs = new Map(daCtx.users
    .flatMap((user) => user.orgs ?? [])
    .map((org) => [org.orgIdent?.toLowerCase(), org.orgIdent]));

  const members = new Map();
  const add = (email, name) => {
    const key = email.toLowerCase();
    if (isTechnicalAccount(key)) return;
    const existing = members.get(key);
    if (!existing || existing.name === key) members.set(key, { email: key, name });
  };

  let partial = false;
  const orgUsers = new Map();
  const loadOrg = (orgIdent) => {
    if (!orgUsers.has(orgIdent)) {
      orgUsers.set(orgIdent, getOrgUsers(env, orgIdent).catch((e) => {
        if (!(e instanceof DirectoryNotConnected)) {
          console.error(`directory lookup failed for ${orgIdent}`, e.message);
          partial = true;
        }
        return [];
      }));
    }
    return orgUsers.get(orgIdent);
  };

  const idents = [...daCtx.aclCtx.pathLookup]
    .filter(([ident, entries]) => grantsRead(entries, target)
      && !(opsOrg && (ident === opsOrg || ident.startsWith(`${opsOrg}/`))))
    .map(([ident]) => ident);

  for (const ident of idents) {
    const [org, member] = ident.split(/\/(.*)/s);
    if (member && EMAIL.test(member)) {
      add(member, member);
    } else if (callerOrgs.has(org)) {
      // eslint-disable-next-line no-await-in-loop
      const users = await loadOrg(callerOrgs.get(org));
      users
        .filter((user) => !member || user.groups.some((group) => group.toLowerCase() === member))
        .forEach((user) => add(user.email, user.name));
    } else if (!member && EMAIL.test(ident)) {
      add(ident, ident);
    }
  }

  const list = [...members.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { body: JSON.stringify({ members: list, partial }), status: 200 };
}
