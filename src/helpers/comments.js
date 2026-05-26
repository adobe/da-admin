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

const ANCHOR_TYPES = new Set(['text', 'image', 'table']);
const MAX_BODY_LENGTH = 10 * 1024;

export function parseCommentsPath(path) {
  // /comments/{org}/{site}/{docId}/threads[/...]
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'comments') return null;
  const [, org, site, docId, ...rest] = parts;
  if (!org || !site || !docId) return null;
  return {
    org, site, docId, rest,
  };
}

export function commentsFileKey(site, docId) {
  return `${site}/.da/comments/${docId}.json`;
}

export function getAuthor(daCtx) {
  const user = daCtx.users?.[0];
  if (!user || user.email === 'anonymous') return null;
  return {
    id: user.ident ?? user.email,
    name: user.name ?? user.email,
    email: user.email,
  };
}

/**
 * Validates a comment write body. Returns `{ ok: true }` on success or
 * `{ ok: false }` on failure.
 *
 * @param body - parsed request body (may be null if JSON parse failed)
 * @param requireAnchor - true for new threads, false for replies
 */
export function validateCommentBody(body, { requireAnchor }) {
  if (!body
    || typeof body.id !== 'string'
    || typeof body.body !== 'string'
    || !Number.isFinite(body.createdAt)) {
    return { ok: false };
  }
  const trimmed = body.body.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BODY_LENGTH) {
    return { ok: false };
  }
  if (requireAnchor && (!body.anchor || !ANCHOR_TYPES.has(body.anchor.anchorType))) {
    return { ok: false };
  }
  return { ok: true };
}

/*
 * Mutator builders. Each returns a `mutate(state)` function suitable for
 * `atomicMutation`. The mutator either mutates `state` in place and returns a
 * success payload, or returns `{ error, status }` to short-circuit the write.
 */

export function addThreadMutator({
  id, anchor, body, createdAt, author,
}) {
  return (state) => {
    if (state.threads[id]) return { error: 'thread_exists', status: 409 };
    // eslint-disable-next-line no-param-reassign
    state.threads[id] = {
      id,
      anchorFrom: anchor.anchorFrom,
      anchorTo: anchor.anchorTo,
      anchorType: anchor.anchorType,
      anchorText: anchor.anchorText ?? '',
      author,
      body,
      createdAt,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      reopenedBy: null,
      reopenedAt: null,
      replies: [],
    };
    return { id };
  };
}

export function addReplyMutator({
  threadId, id, body, createdAt, author,
}) {
  return (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    if ((thread.replies ?? []).some((r) => r.id === id)) {
      return { error: 'reply_exists', status: 409 };
    }
    thread.replies = [...(thread.replies ?? []), {
      id, author, body, createdAt,
    }];
    return { id };
  };
}

export function resolveThreadMutator({ threadId, actor, now = Date.now() }) {
  return (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    Object.assign(thread, {
      resolved: true,
      resolvedBy: actor,
      resolvedAt: now,
      reopenedBy: null,
      reopenedAt: null,
    });
    return thread;
  };
}

export function unresolveThreadMutator({ threadId, actor, now = Date.now() }) {
  return (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    Object.assign(thread, {
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      reopenedBy: actor,
      reopenedAt: now,
    });
    return thread;
  };
}

export function deleteThreadMutator({ threadId }) {
  return (state) => {
    if (!state.threads[threadId]) return { error: 'thread_not_found', status: 404 };
    // eslint-disable-next-line no-param-reassign
    delete state.threads[threadId];
    return {};
  };
}

export function deleteReplyMutator({ threadId, replyId }) {
  return (state) => {
    const thread = state.threads[threadId];
    if (!thread) return { error: 'thread_not_found', status: 404 };
    const replies = thread.replies ?? [];
    if (!replies.some((r) => r.id === replyId)) {
      return { error: 'reply_not_found', status: 404 };
    }
    thread.replies = replies.filter((r) => r.id !== replyId);
    return {};
  };
}
