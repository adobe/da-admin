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
const TTL = 90 * 24 * 60 * 60;
const LIST_LIMIT = 1000;
const MAX_RECIPIENTS = 50;
const MAX_ACTIONS = 1;
const MAX_METADATA_BYTES = 1024;

const EMAIL = /^[^@\s/:]+@[^@\s/:]+\.[^@\s/:]+$/;
const TYPE = /^[a-z0-9-]{1,40}$/;
const KEY = /^[A-Za-z0-9:_./-]{1,150}$/;
const LIMITS = {
  title: 200, description: 300, link: 300, action: 60, label: 24,
};
const TRUSTED_HOST_SUFFIXES = ['.aem.page', '.aem.live'];

const inboxPrefix = (email) => `inbox:${email}:`;
const inboxKey = (email, subject) => `${inboxPrefix(email)}${subject}`;
const subjectPrefix = (subject) => `subject:${subject}|`;
const subjectKey = (subject, email) => `${subjectPrefix(subject)}${email}`;

export const subjectOf = ({ org, site, key }) => `${org}/${site}/${key}`;

const isLocalLink = (link) => link.startsWith('/') && !link.startsWith('//') && !link.includes('\\');

function isTrustedLink(link) {
  if (isLocalLink(link)) return true;
  try {
    const { protocol, hostname } = new URL(link);
    return protocol === 'https:'
      && (hostname === 'da.live' || TRUSTED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)));
  } catch {
    return false;
  }
}

const isAction = (action) => typeof action?.label === 'string' && !!action.label.trim()
  && action.label.length <= LIMITS.label && typeof action.link === 'string'
  && action.link.length <= LIMITS.link && isTrustedLink(action.link);

function optionalActions(actions) {
  if (actions === undefined) return { value: undefined };
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS || !actions.every(isAction)) {
    return { error: 'invalid_actions' };
  }
  return { value: actions.map(({ label, link }) => ({ label, link })) };
}

const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

// KV caps metadata at 1024 bytes, so long text is trimmed rather than rejected
function fitMetadata(metadata) {
  const fitted = { ...metadata };
  for (const field of ['description', 'title']) {
    while (fitted[field] && byteLength(fitted) > MAX_METADATA_BYTES) {
      fitted[field] = `${fitted[field].slice(0, Math.floor(fitted[field].length * 0.8)).trimEnd()}…`;
    }
  }
  return byteLength(fitted) <= MAX_METADATA_BYTES ? fitted : null;
}

function optionalText(body, field) {
  const value = body[field];
  if (value === undefined) return { value: undefined };
  if (typeof value !== 'string' || value.length > LIMITS[field]) return { error: `invalid_${field}` };
  return { value };
}

export function validateNotification(body) {
  if (!TYPE.test(body?.type ?? '')) return { error: 'invalid_type' };
  if (!KEY.test(body.key ?? '')) return { error: 'invalid_key' };

  const recipients = Array.isArray(body.recipients)
    ? [...new Set(body.recipients.map((r) => (typeof r === 'string' ? r.trim().toLowerCase() : '')))]
    : [];
  const validCount = recipients.length > 0 && recipients.length <= MAX_RECIPIENTS;
  if (!validCount || !recipients.every((r) => EMAIL.test(r))) return { error: 'invalid_recipients' };

  const fields = ['title', 'description', 'link', 'action'].map((field) => [field, optionalText(body, field)]);
  const failed = fields.find(([, result]) => result.error);
  if (failed) return { error: failed[1].error };
  const text = Object.fromEntries(fields.map(([field, result]) => [field, result.value]));
  if (text.link && !isTrustedLink(text.link)) return { error: 'invalid_link' };
  const actions = optionalActions(body.actions);
  if (actions.error) return actions;

  return {
    type: body.type, key: body.key, recipients, ...text, actions: actions.value,
  };
}

export async function upsertNotifications(env, notification, now = Date.now()) {
  const { recipients, actor, ...item } = notification;
  const subject = subjectOf(item);
  const metadata = fitMetadata({
    ...item, id: subject, actor, updatedAt: now, read: false, done: false,
  });
  if (!metadata) return { error: 'too_large' };

  const others = recipients.filter((email) => email !== actor.email.toLowerCase());
  await Promise.all(others.flatMap((email) => [
    env.DA_NOTIFICATIONS.put(inboxKey(email, subject), '', { metadata, expirationTtl: TTL }),
    env.DA_NOTIFICATIONS.put(subjectKey(subject, email), '', { expirationTtl: TTL }),
  ]));
  return { notified: others.length };
}

export async function resolveSubject(env, subject) {
  const { keys } = await env.DA_NOTIFICATIONS.list({ prefix: subjectPrefix(subject) });
  await Promise.all(keys.flatMap(({ name }) => {
    const email = name.slice(subjectPrefix(subject).length);
    return [
      env.DA_NOTIFICATIONS.delete(inboxKey(email, subject)),
      env.DA_NOTIFICATIONS.delete(name),
    ];
  }));
  return { resolved: keys.length };
}

async function listInbox(env, email) {
  const prefix = inboxPrefix(email);
  const { keys } = await env.DA_NOTIFICATIONS.list({ prefix, limit: LIST_LIMIT });
  return keys.filter((key) => key.metadata);
}

export async function listNotifications(env, email) {
  const notifications = (await listInbox(env, email))
    .map((key) => key.metadata)
    .filter((item) => !item.done)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { notifications, unread: notifications.filter((item) => !item.read).length };
}

export async function updateNotifications(env, email, ids, change) {
  const keys = (await listInbox(env, email)).filter(({ metadata }) => ids.includes(metadata.id));
  await Promise.all(keys.map(({ name, expiration, metadata }) => env.DA_NOTIFICATIONS.put(name, '', {
    metadata: { ...metadata, ...change },
    ...(expiration ? { expiration } : { expirationTtl: TTL }),
  })));
  return { updated: keys.length };
}
