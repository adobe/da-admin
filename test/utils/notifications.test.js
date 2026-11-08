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
import {
  validateNotification, upsertNotifications, resolveSubject, subjectOf,
  listNotifications, updateNotifications,
} from '../../src/utils/notifications.js';

function kvMock() {
  const store = new Map();
  return {
    store,
    put: async (name, value, opts = {}) => {
      store.set(name, { metadata: opts.metadata, expiration: opts.expiration });
    },
    delete: async (name) => {
      store.delete(name);
    },
    list: async ({ prefix }) => ({
      keys: [...store.keys()].sort()
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name, ...store.get(name) })),
    }),
  };
}

const actor = { email: 'pat@example.com', name: 'Pat Lee' };
const base = {
  type: 'comment-mention',
  key: 'comment:t1',
  org: 'acme',
  site: 'web',
  path: '/drafts/page',
  title: 'page',
  description: 'can we change this?',
  link: '/canvas?comment=t1#/acme/web/drafts/page',
  actor,
};

describe('notifications store', () => {
  describe('validateNotification', () => {
    it('accepts a valid notification and normalizes recipients', () => {
      const result = validateNotification({
        type: 'comment-mention', key: 'comment:t1', recipients: [' Sam@Example.com ', 'sam@example.com'], link: '/canvas#/a/b',
      });
      assert.deepStrictEqual(result, {
        type: 'comment-mention', key: 'comment:t1', recipients: ['sam@example.com'], title: undefined, description: undefined, link: '/canvas#/a/b', action: undefined, actions: undefined,
      });
    });

    it('rejects bad input', () => {
      const ok = { type: 'x', key: 'k', recipients: ['a@b.co'] };
      assert.strictEqual(validateNotification(null).error, 'invalid_type');
      assert.strictEqual(validateNotification({ ...ok, type: 'Bad Type' }).error, 'invalid_type');
      assert.strictEqual(validateNotification({ ...ok, key: 'has space' }).error, 'invalid_key');
      assert.strictEqual(validateNotification({ ...ok, recipients: [] }).error, 'invalid_recipients');
      assert.strictEqual(validateNotification({ ...ok, recipients: ['nope'] }).error, 'invalid_recipients');
      assert.strictEqual(validateNotification({ ...ok, title: 5 }).error, 'invalid_title');
      assert.strictEqual(validateNotification({ ...ok, description: 'x'.repeat(301) }).error, 'invalid_description');
      assert.strictEqual(validateNotification({ ...ok, link: 'https://evil.example' }).error, 'invalid_link');
      assert.strictEqual(validateNotification({ ...ok, link: '//evil.example' }).error, 'invalid_link');
      assert.strictEqual(validateNotification({ ...ok, link: 'http://main--s--o.aem.page/' }).error, 'invalid_link');
      assert.strictEqual(validateNotification({ ...ok, link: 'https://x.aem.page.evil.example/' }).error, 'invalid_link');
      assert.strictEqual(validateNotification({ ...ok, action: 'x'.repeat(61) }).error, 'invalid_action');
      assert.strictEqual(validateNotification({ ...ok, recipients: ['a@b.co:x'] }).error, 'invalid_recipients');
    });
  });

  it('keeps one row per subject, refreshed by new activity, and skips the actor', async () => {
    const env = { DA_NOTIFICATIONS: kvMock() };
    await upsertNotifications(env, { ...base, recipients: ['sam@example.com', 'pat@example.com'] }, 1);
    const second = { ...base, description: 'second', actor: { email: 'kim@example.com', name: 'Kim' } };
    const result = await upsertNotifications(env, { ...second, recipients: ['sam@example.com'] }, 2);

    assert.deepStrictEqual(result, { notified: 1 });
    const { notifications, unread } = await listNotifications(env, 'sam@example.com');
    assert.strictEqual(unread, 1);
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].id, 'acme/web/comment:t1');
    assert.strictEqual(notifications[0].description, 'second');
    assert.deepStrictEqual(notifications[0].actor, { email: 'kim@example.com', name: 'Kim' });
    assert.deepStrictEqual((await listNotifications(env, 'pat@example.com')).notifications, []);
  });

  it('lists newest first and hides done items until new activity', async () => {
    const env = { DA_NOTIFICATIONS: kvMock() };
    await upsertNotifications(env, { ...base, recipients: ['sam@example.com'] }, 1);
    await upsertNotifications(env, { ...base, key: 'comment:t2', recipients: ['sam@example.com'] }, 2);

    assert.deepStrictEqual((await listNotifications(env, 'sam@example.com')).notifications.map((n) => n.key), ['comment:t2', 'comment:t1']);

    await updateNotifications(env, 'sam@example.com', ['acme/web/comment:t1'], { done: true });
    assert.deepStrictEqual((await listNotifications(env, 'sam@example.com')).notifications.map((n) => n.key), ['comment:t2']);

    await upsertNotifications(env, { ...base, recipients: ['sam@example.com'] }, 3);
    assert.deepStrictEqual((await listNotifications(env, 'sam@example.com')).notifications.map((n) => n.key), ['comment:t1', 'comment:t2']);
  });

  it('marks only the caller\'s items read', async () => {
    const env = { DA_NOTIFICATIONS: kvMock() };
    await upsertNotifications(env, { ...base, recipients: ['sam@example.com', 'kim@example.com'] }, 1);

    const result = await updateNotifications(env, 'sam@example.com', ['acme/web/comment:t1', 'other'], { read: true });

    assert.deepStrictEqual(result, { updated: 1 });
    assert.strictEqual((await listNotifications(env, 'sam@example.com')).unread, 0);
    assert.strictEqual((await listNotifications(env, 'kim@example.com')).unread, 1);
  });

  it('resolves a subject for every recipient, scoped to its org and site', async () => {
    const env = { DA_NOTIFICATIONS: kvMock() };
    await upsertNotifications(env, { ...base, recipients: ['sam@example.com', 'kim@example.com'] }, 1);
    await upsertNotifications(env, { ...base, site: 'other', recipients: ['sam@example.com'] }, 1);

    const result = await resolveSubject(env, subjectOf(base));

    assert.deepStrictEqual(result, { resolved: 2 });
    assert.deepStrictEqual((await listNotifications(env, 'sam@example.com')).notifications.map((n) => n.site), ['other']);
    assert.deepStrictEqual((await listNotifications(env, 'kim@example.com')).notifications, []);
  });

  it('accepts path keys and a producer action', () => {
    const result = validateNotification({
      type: 'publish-request', key: 'publish:/products/shoes', recipients: ['a@b.co'], action: 'requested publish of',
    });
    assert.strictEqual(result.key, 'publish:/products/shoes');
    assert.strictEqual(result.action, 'requested publish of');
  });

  it('accepts links to Experience Workspace and AEM sites', () => {
    const ok = { type: 'x', key: 'k', recipients: ['a@b.co'] };
    ['https://da.live/app/x', 'https://main--s--o.aem.page/p', 'https://tools.aem.live/tools/page-status/diff.html'].forEach((link) => {
      assert.strictEqual(validateNotification({ ...ok, link }).link, link);
    });
  });

  it('accepts one action link and rejects bad ones', () => {
    const ok = { type: 'x', key: 'k', recipients: ['a@b.co'] };
    const preview = { label: 'Preview', link: 'https://main--s--o.aem.page/p', extra: 1 };
    assert.deepStrictEqual(validateNotification({ ...ok, actions: [preview] }).actions, [{ label: 'Preview', link: 'https://main--s--o.aem.page/p' }]);
    [
      'nope',
      [preview, preview],
      [{ label: '', link: '/x' }],
      [{ label: 'x'.repeat(25), link: '/x' }],
      [{ label: 'Go', link: 'https://evil.example/' }],
      [null],
    ].forEach((actions) => {
      assert.strictEqual(validateNotification({ ...ok, actions }).error, 'invalid_actions');
    });
  });

  it('resolves only the exact subject, not subjects it prefixes', async () => {
    const env = { DA_NOTIFICATIONS: kvMock() };
    await upsertNotifications(env, { ...base, key: 'publish:/a', recipients: ['sam@example.com'] }, 1);
    await upsertNotifications(env, { ...base, key: 'publish:/a:b', recipients: ['sam@example.com'] }, 2);

    const result = await resolveSubject(env, subjectOf({ ...base, key: 'publish:/a' }));

    assert.deepStrictEqual(result, { resolved: 1 });
    assert.deepStrictEqual((await listNotifications(env, 'sam@example.com')).notifications.map((n) => n.key), ['publish:/a:b']);
  });

  it('trims long text to fit KV metadata', async () => {
    const env = { DA_NOTIFICATIONS: kvMock() };
    await upsertNotifications(env, {
      ...base, title: 't'.repeat(200), description: 'd'.repeat(300), link: `/${'l'.repeat(299)}`, recipients: ['sam@example.com'],
    }, 1);

    const [item] = (await listNotifications(env, 'sam@example.com')).notifications;
    assert.ok(new TextEncoder().encode(JSON.stringify(item)).length <= 1024);
    assert.ok(item.description.endsWith('…'));
  });
});
