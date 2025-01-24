/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import assert from 'assert';
import esmock from 'esmock';

describe('List Route', () => {
  it('Test getList with permissions', async () => {
    const loCalled = [];
    const listObjects = (e, c) => {
      loCalled.push({ e, c });
      return {};
    }

    const ctx = { org: 'foo', key: 'q/q/q' };
    const hasPermission = (c, k, a) => {
      if (k === 'q/q/q' && a === 'read') {
        return false;
      }
      return true;
    }

    const getList = await esmock(
      '../../src/routes/list.js', {
        '../../src/storage/object/list.js': {
          default: listObjects
        },
        '../../src/utils/auth.js': {
          hasPermission
        }
      }
    );
    const resp = await getList({ env: {}, daCtx: ctx, aclCtx: {} });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, loCalled.length);

    await getList({ env: {}, daCtx: { org: 'bar', key: 'q/q', users: [], aclCtx: {} }});
    assert.strictEqual(1, loCalled.length);
    assert.strictEqual('q/q', loCalled[0].c.key);
  });
});
