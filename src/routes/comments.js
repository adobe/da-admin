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
import { atomicMutation } from '../storage/object/comments.js';
import { hasPermission } from '../utils/auth.js';

const ANCHOR_TYPES = new Set(['text', 'image', 'table']);
const MAX_BODY_LENGTH = 10 * 1024; // 10 KB

function parseCommentsPath(path) {
  // /comments/{org}/{site}/{docId}/threads[/...]
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'comments') return null;
  const [, org, site, docId, ...rest] = parts;
  if (!org || !site || !docId) return null;
  return {
    org, site, docId, rest,
  };
}

function commentsFileKey(site, docId) {
  return `${site}/.da/comments/${docId}.json`;
}

function getAuthor(daCtx) {
  const user = daCtx.users?.[0];
  if (!user || user.email === 'anonymous') return null;
  return {
    id: user.ident ?? user.email,
    name: user.name ?? user.email,
    email: user.email,
  };
}

function errResponse(status, error, message) {
  return {
    status,
    body: JSON.stringify({ error, ...(message ? { message } : {}) }),
    contentType: 'application/json',
  };
}

function okResponse(status, payload) {
  return {
    status,
    body: JSON.stringify(payload),
    contentType: 'application/json',
  };
}

/**
 * Validates a comment write body. Returns `{ ok: true, trimmedBody }` on success
 * or `{ ok: false, error: 'invalid_body' }` on failure.
 *
 * @param body - parsed request body (may be null if JSON parse failed)
 * @param requireAnchor - true for new threads, false for replies
 */
function validateCommentBody(body, { requireAnchor }) {
  if (!body
    || typeof body.id !== 'string'
    || typeof body.body !== 'string'
    || !Number.isFinite(body.createdAt)) {
    return { ok: false };
  }
  const trimmedBody = body.body.trim();
  if (trimmedBody.length === 0 || trimmedBody.length > MAX_BODY_LENGTH) {
    return { ok: false };
  }
  if (requireAnchor && (!body.anchor || !ANCHOR_TYPES.has(body.anchor.anchorType))) {
    return { ok: false };
  }
  return { ok: true, trimmedBody };
}

/**
 * Common auth gate for all comment write endpoints. Returns either
 *   - `{ actor, fileKey }` on success, OR
 *   - `{ response }` with a 401/403 error response if the request should be
 *     short-circuited.
 *
 * Callers check for `response` and return it directly if present.
 */
function checkWriteAuth(daCtx, parsed) {
  const { site, docId } = parsed;
  const fileKey = commentsFileKey(site, docId);
  if (!hasPermission(daCtx, `/${fileKey}`, 'write')) {
    return { response: errResponse(403, 'forbidden') };
  }
  const actor = getAuthor(daCtx);
  if (!actor) {
    return { response: errResponse(401, 'unauthenticated') };
  }
  return { actor, fileKey };
}

async function addThread({
  req, env, daCtx, parsed,
}) {
  const { org } = parsed;
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;
  const { actor: author, fileKey } = auth;

  const body = await req.json().catch(() => null);
  const validation = validateCommentBody(body, { requireAnchor: true });
  if (!validation.ok) return errResponse(400, 'invalid_body');

  const result = await atomicMutation(env, org, fileKey, (state) => {
    if (state.threads[body.id]) return { error: 'thread_exists', status: 409 };
    // eslint-disable-next-line no-param-reassign
    state.threads[body.id] = {
      id: body.id,
      anchorFrom: body.anchor.anchorFrom,
      anchorTo: body.anchor.anchorTo,
      anchorType: body.anchor.anchorType,
      anchorText: body.anchor.anchorText ?? '',
      author,
      body: body.body,
      createdAt: body.createdAt,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      reopenedBy: null,
      reopenedAt: null,
      replies: [],
    };
    return { id: body.id };
  });

  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  return okResponse(201, result.result);
}

async function addReply({
  req, env, daCtx, parsed,
}) {
  const { org, rest } = parsed;
  const threadId = rest[1];
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;
  const { actor: author, fileKey } = auth;

  const body = await req.json().catch(() => null);
  const validation = validateCommentBody(body, { requireAnchor: false });
  if (!validation.ok) return errResponse(400, 'invalid_body');

  const result = await atomicMutation(env, org, fileKey, (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    if ((thread.replies ?? []).some((r) => r.id === body.id)) {
      return { error: 'reply_exists', status: 409 };
    }
    thread.replies = [...(thread.replies ?? []), {
      id: body.id,
      author,
      body: body.body,
      createdAt: body.createdAt,
    }];
    return { id: body.id };
  });

  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  return okResponse(201, result.result);
}

async function resolveThread({ env, daCtx, parsed }) {
  const { org, rest } = parsed;
  const threadId = rest[1];
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;
  const { actor, fileKey } = auth;

  const result = await atomicMutation(env, org, fileKey, (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    Object.assign(thread, {
      resolved: true,
      resolvedBy: actor,
      resolvedAt: Date.now(),
      reopenedBy: null,
      reopenedAt: null,
    });
    return thread;
  });

  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  return okResponse(200, result.result);
}

async function unresolveThread({ env, daCtx, parsed }) {
  const { org, rest } = parsed;
  const threadId = rest[1];
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;
  const { actor, fileKey } = auth;

  const result = await atomicMutation(env, org, fileKey, (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    Object.assign(thread, {
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      reopenedBy: actor,
      reopenedAt: Date.now(),
    });
    return thread;
  });

  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  return okResponse(200, result.result);
}

async function deleteThread({ env, daCtx, parsed }) {
  const { org, rest } = parsed;
  const threadId = rest[1];
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;
  const { fileKey } = auth;

  const result = await atomicMutation(env, org, fileKey, (state) => {
    if (!state.threads[threadId]) return { error: 'thread_not_found', status: 404 };
    // eslint-disable-next-line no-param-reassign
    delete state.threads[threadId];
    return {};
  });

  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  return { status: 204 };
}

async function deleteReply({ env, daCtx, parsed }) {
  const { org, rest } = parsed;
  const threadId = rest[1];
  const replyId = rest[3];
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;
  const { fileKey } = auth;

  const result = await atomicMutation(env, org, fileKey, (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    const replies = thread.replies ?? [];
    if (!replies.some((r) => r.id === replyId)) return { error: 'reply_not_found', status: 404 };
    thread.replies = replies.filter((r) => r.id !== replyId);
    return {};
  });

  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  return { status: 204 };
}

export async function postComments({ req, env, daCtx }) {
  const parsed = parseCommentsPath(daCtx.path);
  if (!parsed) return errResponse(400, 'invalid_path');

  const { rest } = parsed;
  // POST /comments/{org}/{site}/{docId}/threads
  if (rest.length === 1 && rest[0] === 'threads') {
    return addThread({
      req, env, daCtx, parsed,
    });
  }
  // POST /comments/{org}/{site}/{docId}/threads/{threadId}/replies
  if (rest.length === 3 && rest[0] === 'threads' && rest[2] === 'replies') {
    return addReply({
      req, env, daCtx, parsed,
    });
  }
  // POST /comments/{org}/{site}/{docId}/threads/{threadId}/resolve
  if (rest.length === 3 && rest[0] === 'threads' && rest[2] === 'resolve') {
    return resolveThread({ env, daCtx, parsed });
  }
  // POST /comments/{org}/{site}/{docId}/threads/{threadId}/unresolve
  if (rest.length === 3 && rest[0] === 'threads' && rest[2] === 'unresolve') {
    return unresolveThread({ env, daCtx, parsed });
  }
  return errResponse(404, 'unknown_endpoint');
}

export async function deleteComments({ env, daCtx }) {
  const parsed = parseCommentsPath(daCtx.path);
  if (!parsed) return errResponse(400, 'invalid_path');

  const { rest } = parsed;
  // DELETE /comments/{org}/{site}/{docId}/threads/{threadId}
  if (rest.length === 2 && rest[0] === 'threads') {
    return deleteThread({ env, daCtx, parsed });
  }
  // DELETE /comments/{org}/{site}/{docId}/threads/{threadId}/replies/{replyId}
  if (rest.length === 4 && rest[0] === 'threads' && rest[2] === 'replies') {
    return deleteReply({ env, daCtx, parsed });
  }
  return errResponse(404, 'unknown_endpoint');
}
