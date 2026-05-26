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
import {
  parseCommentsPath,
  commentsFileKey,
  getAuthor,
  validateCommentBody,
  addThreadMutator,
  addReplyMutator,
  resolveThreadMutator,
  unresolveThreadMutator,
  deleteThreadMutator,
  deleteReplyMutator,
} from '../helpers/comments.js';

function errResponse(status, error) {
  return {
    status,
    body: JSON.stringify({ error }),
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
 * Common auth gate for all comment write endpoints. Returns either
 *   - `{ actor, fileKey }` on success, OR
 *   - `{ response }` with a 401/403 error response if the request should be
 *     short-circuited.
 */
function checkWriteAuth(daCtx, parsed) {
  const fileKey = commentsFileKey(parsed.site, parsed.docId);
  if (!hasPermission(daCtx, `/${fileKey}`, 'write')) {
    return { response: errResponse(403, 'forbidden') };
  }
  const actor = getAuthor(daCtx);
  if (!actor) return { response: errResponse(401, 'unauthenticated') };
  return { actor, fileKey };
}

function mapMutationResult(result, successStatus, successPayload) {
  if (!result.ok) return errResponse(result.status ?? 500, result.error ?? 'internal_error');
  if (successStatus === 204) return { status: 204 };
  return okResponse(successStatus, successPayload ?? result.result);
}

async function addThread({
  req, env, daCtx, parsed,
}) {
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => null);
  if (!validateCommentBody(body, { requireAnchor: true }).ok) {
    return errResponse(400, 'invalid_body');
  }

  const result = await atomicMutation(env, parsed.org, auth.fileKey, addThreadMutator({
    id: body.id,
    anchor: body.anchor,
    body: body.body,
    createdAt: body.createdAt,
    author: auth.actor,
  }));
  return mapMutationResult(result, 201);
}

async function addReply({
  req, env, daCtx, parsed,
}) {
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => null);
  if (!validateCommentBody(body, { requireAnchor: false }).ok) {
    return errResponse(400, 'invalid_body');
  }

  const result = await atomicMutation(env, parsed.org, auth.fileKey, addReplyMutator({
    threadId: parsed.rest[1],
    id: body.id,
    body: body.body,
    createdAt: body.createdAt,
    author: auth.actor,
  }));
  return mapMutationResult(result, 201);
}

async function resolveThread({ env, daCtx, parsed }) {
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;

  const result = await atomicMutation(env, parsed.org, auth.fileKey, resolveThreadMutator({
    threadId: parsed.rest[1],
    actor: auth.actor,
  }));
  return mapMutationResult(result, 200);
}

async function unresolveThread({ env, daCtx, parsed }) {
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;

  const result = await atomicMutation(env, parsed.org, auth.fileKey, unresolveThreadMutator({
    threadId: parsed.rest[1],
    actor: auth.actor,
  }));
  return mapMutationResult(result, 200);
}

async function deleteThread({ env, daCtx, parsed }) {
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;

  const result = await atomicMutation(env, parsed.org, auth.fileKey, deleteThreadMutator({
    threadId: parsed.rest[1],
  }));
  return mapMutationResult(result, 204);
}

async function deleteReply({ env, daCtx, parsed }) {
  const auth = checkWriteAuth(daCtx, parsed);
  if (auth.response) return auth.response;

  const result = await atomicMutation(env, parsed.org, auth.fileKey, deleteReplyMutator({
    threadId: parsed.rest[1],
    replyId: parsed.rest[3],
  }));
  return mapMutationResult(result, 204);
}

export async function postComments({ req, env, daCtx }) {
  const parsed = parseCommentsPath(daCtx.path);
  if (!parsed) return errResponse(400, 'invalid_path');

  const { rest } = parsed;
  if (rest.length === 1 && rest[0] === 'threads') {
    return addThread({
      req, env, daCtx, parsed,
    });
  }
  if (rest.length === 3 && rest[0] === 'threads' && rest[2] === 'replies') {
    return addReply({
      req, env, daCtx, parsed,
    });
  }
  if (rest.length === 3 && rest[0] === 'threads' && rest[2] === 'resolve') {
    return resolveThread({ env, daCtx, parsed });
  }
  if (rest.length === 3 && rest[0] === 'threads' && rest[2] === 'unresolve') {
    return unresolveThread({ env, daCtx, parsed });
  }
  return errResponse(404, 'unknown_endpoint');
}

export async function deleteComments({ env, daCtx }) {
  const parsed = parseCommentsPath(daCtx.path);
  if (!parsed) return errResponse(400, 'invalid_path');

  const { rest } = parsed;
  if (rest.length === 2 && rest[0] === 'threads') {
    return deleteThread({ env, daCtx, parsed });
  }
  if (rest.length === 4 && rest[0] === 'threads' && rest[2] === 'replies') {
    return deleteReply({ env, daCtx, parsed });
  }
  return errResponse(404, 'unknown_endpoint');
}
