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

const user = { email: 'Pat@Example.com', name: 'Pat Lee' };

async function load() {
  const calls = [];
  const record = (name, result) => async (...args) => {
    calls.push([name, ...args.slice(1)]);
    return result;
  };
  const route = await esmock('../../src/routes/notifications.js', {
    '../../src/utils/notifications.js': {
      validateNotification: (body) => (body?.type ? { ...body } : { error: 'invalid_type' }),
      subjectOf: ({ org, site, key }) => `${org}/${site}/${key}`,
      upsertNotifications: record('upsert', { notified: 1 }),
      resolveSubject: record('resolve', { resolved: 2 }),
      listNotifications: record('list', { notifications: [], unread: 0 }),
      updateNotifications: record('update', { updated: 1 }),
    },
  });
  return { ...route, calls };
}

const env = { DA_NOTIFICATIONS: {} };
const req = (body) => new Request('https://admin.da.live/notifications', { method: 'POST', body: JSON.stringify(body) });
const rootCtx = { users: [user] };
const docCtx = {
  users: [user], org: 'acme', site: 'web', key: 'web/drafts/page',
};
const post = (route, body, daCtx) => route.postNotifications({ req: req(body), env, daCtx });
const del = (route, body, daCtx) => route.deleteNotifications({ req: req(body), env, daCtx });

describe('notifications route', () => {
  it("lists the caller's notifications", async () => {
    const { getNotifications, calls } = await load();
    const resp = await getNotifications({ env, daCtx: rootCtx });
    assert.strictEqual(resp.status, 200);
    assert.deepStrictEqual(calls, [['list', 'pat@example.com']]);
  });

  it('only lists at the root', async () => {
    const { getNotifications } = await load();
    assert.strictEqual(await getNotifications({ env, daCtx: docCtx }), undefined);
  });

  it('501s when the store is not configured', async () => {
    const route = await load();
    const statusOf = async (name, daCtx) => {
      const resp = await route[name]({ req: req({}), env: {}, daCtx });
      return resp.status;
    };
    assert.strictEqual(await statusOf('getNotifications', rootCtx), 501);
    assert.strictEqual(await statusOf('postNotifications', docCtx), 501);
    assert.strictEqual(await statusOf('deleteNotifications', docCtx), 501);
  });

  it('notifies on a document as the caller', async () => {
    const route = await load();
    const { calls } = route;
    const resp = await post(route, { type: 'comment-mention', key: 'comment:t1' }, docCtx);
    assert.strictEqual(resp.status, 200);
    assert.deepStrictEqual(calls, [['upsert', {
      type: 'comment-mention',
      key: 'comment:t1',
      org: 'acme',
      site: 'web',
      path: '/drafts/page',
      actor: { email: 'Pat@Example.com', name: 'Pat Lee' },
    }]]);
  });

  it('rejects an invalid notification', async () => {
    const { postNotifications, calls } = await load();
    const resp = await postNotifications({ req: req({}), env, daCtx: docCtx });
    assert.strictEqual(resp.status, 400);
    assert.deepStrictEqual(calls, []);
  });

  it('marks the caller\'s items read or done', async () => {
    const { postNotifications, calls } = await load();
    await postNotifications({ req: req({ read: ['acme/web/comment:t1'] }), env, daCtx: rootCtx });
    await postNotifications({ req: req({ done: ['acme/web/comment:t1'] }), env, daCtx: rootCtx });
    assert.deepStrictEqual(calls, [
      ['update', 'pat@example.com', ['acme/web/comment:t1'], { read: true }],
      ['update', 'pat@example.com', ['acme/web/comment:t1'], { done: true }],
    ]);
  });

  it('400s an empty or unknown update', async () => {
    const route = await load();
    assert.strictEqual((await post(route, { read: [] }, rootCtx)).status, 400);
    assert.strictEqual((await post(route, { archive: ['x'] }, rootCtx)).status, 400);
  });

  it('resolves a subject on the document\'s site', async () => {
    const { deleteNotifications, calls } = await load();
    const resp = await deleteNotifications({ req: req({ key: 'comment:t1' }), env, daCtx: docCtx });
    assert.strictEqual(resp.status, 200);
    assert.deepStrictEqual(calls, [['resolve', 'acme/web/comment:t1']]);
  });

  it('400s a resolve without a key', async () => {
    const route = await load();
    assert.strictEqual((await del(route, {}, docCtx)).status, 400);
  });
});
