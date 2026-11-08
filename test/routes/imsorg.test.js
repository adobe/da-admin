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

const caller = [{
  email: 'admin@example.com',
  orgs: [
    { orgIdent: 'BBB111', orgName: 'Beta' },
    { orgIdent: 'AAA111', orgName: 'Alpha' },
  ],
}];

const ctx = (org, key = '') => ({ users: caller, org, key });
const post = (body) => new Request('https://admin.da.live/imsorg/x', { method: 'POST', body: JSON.stringify(body) });

async function load({ connected = {}, connect } = {}) {
  const calls = { connect: [], disconnect: [] };
  const route = await esmock('../../src/routes/imsorg.js', {
    '../../src/utils/directory.js': {
      isConnected: async (env, org) => Boolean(connected[org]),
      connectOrg: async (env, org, credential) => {
        calls.connect.push({ org, credential });
        return connect ? connect() : { connected: true };
      },
      disconnectOrg: async (env, org) => {
        calls.disconnect.push(org);
      },
    },
  });
  return { ...route, calls };
}

describe('IMS org route', () => {
  it("lists the caller's orgs with their status, sorted by name", async () => {
    const { getImsOrgs } = await load({ connected: { BBB111: true } });
    const resp = await getImsOrgs({ env: {}, daCtx: ctx(undefined) });
    assert.strictEqual(resp.status, 200);
    assert.deepStrictEqual(JSON.parse(resp.body), {
      orgs: [
        { orgIdent: 'AAA111', orgName: 'Alpha', connected: false },
        { orgIdent: 'BBB111', orgName: 'Beta', connected: true },
      ],
    });
  });

  it('only lists at the root', async () => {
    const { getImsOrgs } = await load();
    assert.strictEqual(await getImsOrgs({ env: {}, daCtx: ctx('aaa111') }), undefined);
  });

  it('connects an org the caller belongs to', async () => {
    const { postImsOrg, calls } = await load();
    const resp = await postImsOrg({
      req: post({ clientId: ' cid ', clientSecret: 's', extra: 'x' }), env: {}, daCtx: ctx('aaa111'),
    });
    assert.strictEqual(resp.status, 200);
    assert.deepStrictEqual(calls.connect, [{ org: 'AAA111', credential: { clientId: 'cid', clientSecret: 's' } }]);
  });

  it('403s an org the caller is not a member of', async () => {
    const { postImsOrg, deleteImsOrg, calls } = await load();
    const daCtx = ctx('zzz999');
    assert.strictEqual((await postImsOrg({ req: post({ clientId: 'a', clientSecret: 'b' }), env: {}, daCtx })).status, 403);
    assert.strictEqual((await deleteImsOrg({ env: {}, daCtx })).status, 403);
    assert.deepStrictEqual(calls, { connect: [], disconnect: [] });
  });

  it('400s missing or malformed credentials', async () => {
    const { postImsOrg, calls } = await load();
    const bad = [{ clientId: 'a' }, { clientId: 1, clientSecret: 'b' }, null];
    const results = await Promise.all(bad.map((body) => postImsOrg({ req: post(body), env: {}, daCtx: ctx('aaa111') })));
    results.forEach((resp) => {
      assert.strictEqual(resp.status, 400);
      assert.deepStrictEqual(JSON.parse(resp.body), { error: 'missing_credentials' });
    });
    assert.deepStrictEqual(calls.connect, []);
  });

  it('returns the verification error from connect', async () => {
    const { postImsOrg } = await load({ connect: () => ({ error: 'wrong_org' }) });
    const resp = await postImsOrg({ req: post({ clientId: 'a', clientSecret: 'b' }), env: {}, daCtx: ctx('aaa111') });
    assert.strictEqual(resp.status, 400);
    assert.deepStrictEqual(JSON.parse(resp.body), { error: 'wrong_org' });
  });

  it('502s when the directory is unreachable', async () => {
    const { postImsOrg } = await load({
      connect: () => {
        throw new Error('directory 500');
      },
    });
    const resp = await postImsOrg({ req: post({ clientId: 'a', clientSecret: 'b' }), env: {}, daCtx: ctx('aaa111') });
    assert.strictEqual(resp.status, 502);
  });

  it('disconnects an org the caller belongs to', async () => {
    const { deleteImsOrg, calls } = await load();
    const resp = await deleteImsOrg({ env: {}, daCtx: ctx('aaa111') });
    assert.strictEqual(resp.status, 200);
    assert.deepStrictEqual(JSON.parse(resp.body), { connected: false });
    assert.deepStrictEqual(calls.disconnect, ['AAA111']);
  });

  it('ignores deeper paths', async () => {
    const { postImsOrg, deleteImsOrg } = await load();
    const daCtx = ctx('aaa111', 'extra');
    assert.strictEqual(await postImsOrg({ req: post({}), env: {}, daCtx }), undefined);
    assert.strictEqual(await deleteImsOrg({ env: {}, daCtx }), undefined);
  });
});
