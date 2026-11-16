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
import assert from 'node:assert';
import esmock from 'esmock';

const ORG = '2345B0EA551D747';
const IDENT = ORG.toLowerCase();
const DIRECTORY = {
  [ORG]: [
    { email: 'Alice@example.com', name: 'Alice Smith', groups: ['Marketing', 'Adobe B2B Portal Users'] },
    { email: 'bob@example.com', name: 'Bob Jones', groups: ['Everyone'] },
    { email: 'x1@techacct.adobe.com', name: 'x1@techacct.adobe.com', groups: [] },
  ],
};

const rule = (path, actions = ['read']) => ({ path, actions });

function ctxWith(entries, { callerOrgs = [ORG], key = 'site/page' } = {}) {
  return {
    key,
    users: [{ email: 'me@example.com', orgs: callerOrgs.map((orgIdent) => ({ orgIdent })) }],
    aclCtx: { pathLookup: new Map(Object.entries(entries)) },
  };
}

async function load(getOrgUsers = (org) => DIRECTORY[org] ?? []) {
  const calls = [];
  const mod = await esmock('../../src/routes/members.js', {
    '../../src/utils/directory.js': {
      getOrgUsers: async (env, org) => {
        calls.push(org);
        return getOrgUsers(org);
      },
    },
  });
  return { getMembers: mod.default, calls };
}

async function run(getMembers, daCtx, env = {}) {
  const resp = await getMembers({ env, daCtx });
  return JSON.parse(resp.body);
}

describe('Members route', () => {
  it('merges sheet emails with expanded org users, skipping technical accounts', async () => {
    const { getMembers, calls } = await load();
    const daCtx = ctxWith({
      'carol@example.com': [rule('/+**')],
      [IDENT]: [rule('/+**')],
      'alice@example.com': [rule('/site/**')],
    });

    const { members, partial } = await run(getMembers, daCtx);

    assert.strictEqual(partial, false);
    assert.deepStrictEqual(members, [
      { email: 'alice@example.com', name: 'Alice Smith' },
      { email: 'bob@example.com', name: 'Bob Jones' },
      { email: 'carol@example.com', name: 'carol@example.com' },
    ]);
    assert.deepStrictEqual(calls, [ORG]);
  });

  it('only includes entries that can read the requested path', async () => {
    const { getMembers } = await load();
    const daCtx = ctxWith({
      'reader@example.com': [rule('/site/**')],
      'elsewhere@example.com': [rule('/other/**')],
      'blocked@example.com': [rule('/site/page', []), rule('/+**')],
    });

    const { members } = await run(getMembers, daCtx);

    assert.deepStrictEqual(members.map((m) => m.email), ['reader@example.com']);
  });

  it('filters group entries by directory group membership', async () => {
    const { getMembers, calls } = await load();
    const daCtx = ctxWith({
      [`${IDENT}/adobe b2b portal users`]: [rule('/+**')],
      [`${IDENT}/nobody`]: [rule('/+**')],
    });

    const { members } = await run(getMembers, daCtx);

    assert.deepStrictEqual(members.map((m) => m.email), ['alice@example.com']);
    assert.deepStrictEqual(calls, [ORG]);
  });

  it('never expands an org the caller is not a member of', async () => {
    const { getMembers, calls } = await load();
    const daCtx = ctxWith({ [IDENT]: [rule('/+**')], 'dave@example.com': [rule('/+**')] }, { callerOrgs: ['9999'] });

    const { members } = await run(getMembers, daCtx);

    assert.deepStrictEqual(members.map((m) => m.email), ['dave@example.com']);
    assert.deepStrictEqual(calls, []);
  });

  it('treats org-scoped email entries as plain emails', async () => {
    const { getMembers, calls } = await load();
    const daCtx = ctxWith({ [`${IDENT}/erin@example.com`]: [rule('/+**')] });

    const { members } = await run(getMembers, daCtx);

    assert.deepStrictEqual(members.map((m) => m.email), ['erin@example.com']);
    assert.deepStrictEqual(calls, []);
  });

  it('skips the DA operations org', async () => {
    const { getMembers, calls } = await load();
    const daCtx = ctxWith({ [IDENT]: [rule('/+**', ['read', 'write'])] });

    const { members } = await run(getMembers, daCtx, { DA_OPS_IMS_ORG: ORG });

    assert.deepStrictEqual(members, []);
    assert.deepStrictEqual(calls, []);
  });

  it('returns sheet emails and a partial flag when the directory fails', async () => {
    const { getMembers } = await load(() => {
      throw new Error('boom');
    });
    const daCtx = ctxWith({ [IDENT]: [rule('/+**')], 'frank@example.com': [rule('/+**')] });

    const { members, partial } = await run(getMembers, daCtx);

    assert.strictEqual(partial, true);
    assert.deepStrictEqual(members.map((m) => m.email), ['frank@example.com']);
  });
});
