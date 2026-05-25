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

function makeDaCtx(overrides = {}) {
  return {
    path: '/comments/myorg/mysite/docid/threads',
    org: 'myorg',
    method: 'POST',
    users: [{ email: 'alice@example.com', ident: 'alice@example.com', name: 'Alice Example' }],
    aclCtx: {
      // Empty pathLookup → hasPermission returns true (see auth.js).
      pathLookup: new Map(),
      actionSet: new Set(['read', 'write']),
    },
    key: 'mysite/docid/threads',
    ...overrides,
  };
}

function makeReq(body) {
  return {
    json: async () => body,
    url: 'http://localhost/comments/myorg/mysite/docid/threads',
  };
}

describe('Comments Routes', () => {
  describe('addThread', () => {
    it('creates a thread with server-derived author and returns 201', async () => {
      let captured;
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: {} };
            const result = await mutate(state);
            captured = { state, result };
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });

      const req = makeReq({
        id: 't1',
        anchor: {
          anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
        },
        body: 'hello',
        createdAt: 1234,
      });
      const daCtx = makeDaCtx();
      const resp = await postComments({ req, env: {}, daCtx });
      assert.strictEqual(resp.status, 201);
      const responseBody = JSON.parse(resp.body);
      assert.strictEqual(responseBody.id, 't1');

      assert.strictEqual(captured.state.threads.t1.body, 'hello');
      assert.deepStrictEqual(captured.state.threads.t1.author, { id: 'alice@example.com', name: 'Alice Example', email: 'alice@example.com' });
      assert.strictEqual(captured.state.threads.t1.resolved, false);
      assert.deepStrictEqual(captured.state.threads.t1.replies, []);
    });

    it('ignores client-sent author and uses IMS-derived identity', async () => {
      let captured;
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: {} };
            const result = await mutate(state);
            captured = state.threads.t1?.author;
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });

      const req = makeReq({
        id: 't1',
        anchor: {
          anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
        },
        body: 'hello',
        createdAt: 1234,
        author: { id: 'spoofed@example.com', name: 'Mallory' },
      });
      await postComments({ req, env: {}, daCtx: makeDaCtx() });
      assert.strictEqual(captured.id, 'alice@example.com');
      assert.notStrictEqual(captured.name, 'Mallory');
    });

    it('returns 409 thread_exists when id is already taken', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: { t1: { id: 't1' } } };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: makeReq({
          id: 't1',
          anchor: {
            anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
          },
          body: 'x',
          createdAt: 1,
        }),
        env: {},
        daCtx: makeDaCtx(),
      });
      assert.strictEqual(resp.status, 409);
      assert.strictEqual(JSON.parse(resp.body).error, 'thread_exists');
    });

    it('returns 400 invalid_body when required fields are missing', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: makeReq({ id: 't1', body: 'x' }), // missing anchor + createdAt
        env: {},
        daCtx: makeDaCtx(),
      });
      assert.strictEqual(resp.status, 400);
      assert.strictEqual(JSON.parse(resp.body).error, 'invalid_body');
    });

    it('returns 401 for anonymous users', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: makeReq({
          id: 't1',
          anchor: {
            anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
          },
          body: 'x',
          createdAt: 1,
        }),
        env: {},
        daCtx: makeDaCtx({ users: [{ email: 'anonymous' }] }),
      });
      assert.strictEqual(resp.status, 401);
    });

    it('returns 400 invalid_body for whitespace-only body', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: makeReq({
          id: 't1',
          anchor: {
            anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
          },
          body: '   ',
          createdAt: 1,
        }),
        env: {},
        daCtx: makeDaCtx(),
      });
      assert.strictEqual(resp.status, 400);
      assert.strictEqual(JSON.parse(resp.body).error, 'invalid_body');
    });

    it('returns 400 invalid_body when body exceeds 10 KB', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const tooLong = 'a'.repeat(10 * 1024 + 1);
      const resp = await postComments({
        req: makeReq({
          id: 't1',
          anchor: {
            anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
          },
          body: tooLong,
          createdAt: 1,
        }),
        env: {},
        daCtx: makeDaCtx(),
      });
      assert.strictEqual(resp.status, 400);
      assert.strictEqual(JSON.parse(resp.body).error, 'invalid_body');
    });

    it('returns 403 forbidden when user lacks write permission', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
        '../../src/utils/auth.js': {
          hasPermission: () => false,
        },
      });
      const resp = await postComments({
        req: makeReq({
          id: 't1',
          anchor: {
            anchorFrom: [1], anchorTo: [2], anchorType: 'text', anchorText: 'hi',
          },
          body: 'hello',
          createdAt: 1,
        }),
        env: {},
        daCtx: makeDaCtx(),
      });
      assert.strictEqual(resp.status, 403);
      assert.strictEqual(JSON.parse(resp.body).error, 'forbidden');
    });
  });

  describe('addReply', () => {
    function makeReplyReq(body, threadId = 't1') {
      return {
        json: async () => body,
        url: `http://localhost/comments/myorg/mysite/docid/threads/${threadId}/replies`,
      };
    }

    function makeReplyCtx(overrides = {}) {
      return makeDaCtx({
        path: '/comments/myorg/mysite/docid/threads/t1/replies',
        key: 'mysite/docid/threads/t1/replies',
        ...overrides,
      });
    }

    it('appends a reply to an existing thread with server-derived author', async () => {
      let captured;
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: { t1: { id: 't1', replies: [] } } };
            const result = await mutate(state);
            captured = state.threads.t1.replies;
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1', body: 'hi', createdAt: 1234 }),
        env: {},
        daCtx: makeReplyCtx(),
      });
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(JSON.parse(resp.body).id, 'r1');
      assert.strictEqual(captured.length, 1);
      assert.strictEqual(captured[0].body, 'hi');
      assert.deepStrictEqual(captured[0].author, { id: 'alice@example.com', name: 'Alice Example', email: 'alice@example.com' });
    });

    it('returns 404 thread_not_found when the thread does not exist', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: {} };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1', body: 'hi', createdAt: 1234 }),
        env: {},
        daCtx: makeReplyCtx(),
      });
      assert.strictEqual(resp.status, 404);
      assert.strictEqual(JSON.parse(resp.body).error, 'thread_not_found');
    });

    it('returns 409 reply_exists for duplicate reply id', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: { t1: { id: 't1', replies: [{ id: 'r1' }] } } };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1', body: 'hi', createdAt: 1234 }),
        env: {},
        daCtx: makeReplyCtx(),
      });
      assert.strictEqual(resp.status, 409);
      assert.strictEqual(JSON.parse(resp.body).error, 'reply_exists');
    });

    it('returns 400 invalid_body when required fields are missing', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1' }),
        env: {},
        daCtx: makeReplyCtx(),
      });
      assert.strictEqual(resp.status, 400);
      assert.strictEqual(JSON.parse(resp.body).error, 'invalid_body');
    });

    it('returns 401 for anonymous users', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1', body: 'hi', createdAt: 1 }),
        env: {},
        daCtx: makeReplyCtx({ users: [{ email: 'anonymous' }] }),
      });
      assert.strictEqual(resp.status, 401);
    });

    it('returns 403 when user lacks write permission', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
        '../../src/utils/auth.js': {
          hasPermission: () => false,
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1', body: 'hi', createdAt: 1 }),
        env: {},
        daCtx: makeReplyCtx(),
      });
      assert.strictEqual(resp.status, 403);
    });

    it('returns 400 invalid_body for whitespace-only body', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: makeReplyReq({ id: 'r1', body: '   ', createdAt: 1 }),
        env: {},
        daCtx: makeReplyCtx(),
      });
      assert.strictEqual(resp.status, 400);
      assert.strictEqual(JSON.parse(resp.body).error, 'invalid_body');
    });
  });

  describe('resolveThread / unresolveThread', () => {
    it('resolveThread sets resolved fields with server-derived actor', async () => {
      let captured;
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: { t1: { id: 't1', resolved: false, replies: [] } } };
            const result = await mutate(state);
            captured = state.threads.t1;
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: { json: async () => ({}) },
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1/resolve',
          key: 'mysite/docid/threads/t1/resolve',
        }),
      });
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(captured.resolved, true);
      assert.deepStrictEqual(captured.resolvedBy, { id: 'alice@example.com', name: 'Alice Example', email: 'alice@example.com' });
      assert.ok(Number.isFinite(captured.resolvedAt));
      assert.strictEqual(captured.reopenedBy, null);
      assert.strictEqual(captured.reopenedAt, null);
    });

    it('unresolveThread clears resolved fields and sets reopen', async () => {
      let captured;
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = {
              version: 1,
              threads: {
                t1: {
                  id: 't1',
                  resolved: true,
                  resolvedBy: { id: 'x', name: 'X' },
                  resolvedAt: 100,
                  reopenedBy: null,
                  reopenedAt: null,
                  replies: [],
                },
              },
            };
            const result = await mutate(state);
            captured = state.threads.t1;
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: { json: async () => ({}) },
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1/unresolve',
          key: 'mysite/docid/threads/t1/unresolve',
        }),
      });
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(captured.resolved, false);
      assert.strictEqual(captured.resolvedBy, null);
      assert.strictEqual(captured.resolvedAt, null);
      assert.deepStrictEqual(captured.reopenedBy, { id: 'alice@example.com', name: 'Alice Example', email: 'alice@example.com' });
      assert.ok(Number.isFinite(captured.reopenedAt));
    });

    it('resolveThread returns 404 when thread does not exist', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: {} };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await postComments({
        req: { json: async () => ({}) },
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/missing/resolve',
          key: 'mysite/docid/threads/missing/resolve',
        }),
      });
      assert.strictEqual(resp.status, 404);
      assert.strictEqual(JSON.parse(resp.body).error, 'thread_not_found');
    });

    it('resolveThread returns 401 for anonymous users', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await postComments({
        req: { json: async () => ({}) },
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1/resolve',
          key: 'mysite/docid/threads/t1/resolve',
          users: [{ email: 'anonymous' }],
        }),
      });
      assert.strictEqual(resp.status, 401);
    });

    it('resolveThread returns 403 when user lacks write permission', async () => {
      const { postComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
        '../../src/utils/auth.js': {
          hasPermission: () => false,
        },
      });
      const resp = await postComments({
        req: { json: async () => ({}) },
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1/resolve',
          key: 'mysite/docid/threads/t1/resolve',
        }),
      });
      assert.strictEqual(resp.status, 403);
    });
  });

  describe('deleteThread / deleteReply', () => {
    it('deleteThread removes the thread and returns 204', async () => {
      let captured;
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = {
              version: 1,
              threads: {
                t1: { id: 't1', author: { id: 'alice@example.com', name: 'alice@example.com' }, replies: [] },
                t2: { id: 't2', author: { id: 'other', name: 'other' }, replies: [] },
              },
            };
            const result = await mutate(state);
            captured = state;
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1',
          key: 'mysite/docid/threads/t1',
          method: 'DELETE',
        }),
      });
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(captured.threads.t1, undefined);
      assert.ok(captured.threads.t2);
    });

    it('deleteThread returns 404 when missing', async () => {
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: {} };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/missing',
          key: 'mysite/docid/threads/missing',
          method: 'DELETE',
        }),
      });
      assert.strictEqual(resp.status, 404);
      assert.strictEqual(JSON.parse(resp.body).error, 'thread_not_found');
    });

    it('deleteThread returns 401 for anonymous users', async () => {
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1',
          key: 'mysite/docid/threads/t1',
          method: 'DELETE',
          users: [{ email: 'anonymous' }],
        }),
      });
      assert.strictEqual(resp.status, 401);
    });

    it('deleteThread returns 403 when user lacks write permission', async () => {
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async () => { throw new Error('should not be called'); },
        },
        '../../src/utils/auth.js': {
          hasPermission: () => false,
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1',
          key: 'mysite/docid/threads/t1',
          method: 'DELETE',
        }),
      });
      assert.strictEqual(resp.status, 403);
    });

    it('deleteReply removes a reply, leaves the thread', async () => {
      let captured;
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = {
              version: 1,
              threads: {
                t1: {
                  id: 't1',
                  replies: [
                    { id: 'r1', body: 'one' },
                    { id: 'r2', body: 'two' },
                  ],
                },
              },
            };
            const result = await mutate(state);
            captured = state.threads.t1;
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1/replies/r1',
          key: 'mysite/docid/threads/t1/replies/r1',
          method: 'DELETE',
        }),
      });
      assert.strictEqual(resp.status, 204);
      assert.strictEqual(captured.replies.length, 1);
      assert.strictEqual(captured.replies[0].id, 'r2');
    });

    it('deleteReply returns 404 when reply not present', async () => {
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: { t1: { id: 't1', replies: [] } } };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/t1/replies/missing',
          key: 'mysite/docid/threads/t1/replies/missing',
          method: 'DELETE',
        }),
      });
      assert.strictEqual(resp.status, 404);
      assert.strictEqual(JSON.parse(resp.body).error, 'reply_not_found');
    });

    it('deleteReply returns 404 when thread missing', async () => {
      const { deleteComments } = await esmock('../../src/routes/comments.js', {
        '../../src/storage/object/comments.js': {
          atomicMutation: async (env, org, key, mutate) => {
            const state = { version: 1, threads: {} };
            const result = await mutate(state);
            if (result?.error) return { ok: false, ...result };
            return { ok: true, result };
          },
        },
      });
      const resp = await deleteComments({
        req: {},
        env: {},
        daCtx: makeDaCtx({
          path: '/comments/myorg/mysite/docid/threads/missing/replies/r1',
          key: 'mysite/docid/threads/missing/replies/r1',
          method: 'DELETE',
        }),
      });
      assert.strictEqual(resp.status, 404);
      assert.strictEqual(JSON.parse(resp.body).error, 'thread_not_found');
    });
  });
});
