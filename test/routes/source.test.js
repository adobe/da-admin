/*
 * Copyright 2024 Adobe. All rights reserved.
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


describe('Source Route', () => {
  describe('postSource', () => {
    for (const status of [200, 201]) {
      it(`invalidates collab w/ put status === ${status}`, async () => {
        const called = [];
        const req = undefined
        const env = {};
        const daCtx = {
          key: 'wknd/index.html',
        };
        const { postSource } = await esmock(
          '../../src/routes/source.js', {
            '../../src/helpers/source.js': {
              default: async () => undefined,
            },
            '../../src/storage/object/put.js': {
              default: async (e, d, o) => {
                assert.deepStrictEqual(e, env);
                assert.deepStrictEqual(d, daCtx);
                assert.ifError(o);
                return { status: status }
              }
            },
            '../../src/storage/utils/collab.js': {
              syncCollab: async (e, c) => {
                assert.deepStrictEqual(e, env);
                assert.deepStrictEqual(c, daCtx);
                called.push(c.key);
              },
            }
          });
        const resp = await postSource({ req, env, daCtx });
        assert.strictEqual(status, resp.status);
        assert.deepStrictEqual(called, ['wknd/index.html'])
      });
    }
    it('does not invalidate collab on put failure', async () => {
      const req = undefined
      const env = {};
      const daCtx = {};
      const { postSource } = await esmock(
        '../../src/routes/source.js', {
          '../../src/helpers/source.js': {
            default: async () => undefined,
          },
          '../../src/storage/object/put.js': {
            default: async (e, d, o) => {
              assert.deepStrictEqual(e, env);
              assert.deepStrictEqual(d, daCtx);
              assert.ifError(o);
              return { status: 500 }
            }
          },
          '../../src/storage/utils/collab.js': {
            syncCollab: async () => assert.fail('should not call syncCollab'),
          }
        });
      const resp = await postSource({ req, env, daCtx });
      assert.strictEqual(500, resp.status);
    });
  });
  describe('getSource', () => {
    it('succeeds', async () => {
      const env = {};
      const daCtx = {};
      const { getSource } = await esmock(
        '../../src/routes/source.js', {
          '../../src/storage/object/get.js': {
            default: (e, c) => {
              assert.deepStrictEqual(e, env);
              assert.deepStrictEqual(c, daCtx);
              return { status: 200 };
            },
          },
        },
      );
      const resp = await getSource({ env, daCtx });
      assert.strictEqual(200, resp.status);
    });
  });

  describe('deleteSource', () => {
    it('succeeds', async () => {
      const env = {};
      const daCtx = {};
      const { deleteSource } = await esmock(
        '../../src/routes/source.js', {
          '../../src/storage/object/delete.js': {
            default: (e, c) => {
              assert.deepStrictEqual(e, env);
              assert.deepStrictEqual(c, daCtx);
              return { status: 200 };
            },
          },
        },
      );
      const resp = await deleteSource({ env, daCtx });
      assert.strictEqual(200, resp.status);
    });
  });
});
