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
import {
  validateNotification, upsertNotifications, resolveSubject, subjectOf,
  listNotifications, updateNotifications,
} from '../utils/notifications.js';

const json = (status, body) => ({ status, body: JSON.stringify(body) });

const CHANGES = { read: { read: true }, done: { done: true } };

const caller = (daCtx) => daCtx.users[0];

const readBody = (req) => req.json().catch(() => null);

const isIdList = (ids) => Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string');

const docPath = (daCtx) => `/${daCtx.key.split('/').slice(1).join('/')}`;

export async function getNotifications({ env, daCtx }) {
  if (daCtx.org) return undefined;
  if (!env.DA_NOTIFICATIONS) return { status: 501 };
  return json(200, await listNotifications(env, caller(daCtx).email.toLowerCase()));
}

async function updateOwn(req, env, daCtx) {
  const body = await readBody(req);
  const action = Object.keys(CHANGES).find((name) => isIdList(body?.[name]));
  if (!action) return json(400, { error: 'invalid_update' });
  const email = caller(daCtx).email.toLowerCase();
  return json(200, await updateNotifications(env, email, body[action], CHANGES[action]));
}

async function notify(req, env, daCtx) {
  const notification = validateNotification(await readBody(req));
  if (notification.error) return json(400, notification);

  const { email, name } = caller(daCtx);
  const result = await upsertNotifications(env, {
    ...notification,
    org: daCtx.org,
    site: daCtx.site,
    path: docPath(daCtx),
    actor: { email, name: name ?? email },
  });
  return json(result.error ? 400 : 200, result);
}

export async function postNotifications({ req, env, daCtx }) {
  if (!env.DA_NOTIFICATIONS) return { status: 501 };
  if (!daCtx.org) return updateOwn(req, env, daCtx);
  if (!daCtx.site) return undefined;
  return notify(req, env, daCtx);
}

export async function deleteNotifications({ req, env, daCtx }) {
  if (!env.DA_NOTIFICATIONS) return { status: 501 };
  if (!daCtx.site) return undefined;
  const key = (await readBody(req))?.key;
  if (typeof key !== 'string' || !key) return json(400, { error: 'invalid_key' });
  return json(200, await resolveSubject(env, subjectOf({ org: daCtx.org, site: daCtx.site, key })));
}
