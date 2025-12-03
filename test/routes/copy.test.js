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
import assert from 'node:assert';
import esmock from 'esmock';

describe('Copy Route', () => {
  it('Test copyHandler with permissions', async () => {
    const copyCalled = [];
    const copyObject = (e, c, d, m) => {
      copyCalled.push({
        e, c, d, m,
      });
      return { status: 200 };
    };

    const hasPermission = (c, k, a) => {
      if (k === 'my/src.html' && a === 'read') {
        return false;
      }
      if (k === 'my/dest.html' && a === 'write') {
        return false;
      }
      return true;
    };
    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/storage/object/copy.js': {
        default: copyObject,
      },
      '../../src/utils/auth.js': { hasPermission },
    });

    const formdata = new Map();
    formdata.set('destination', '/myorg/MY/dest.html');
    const req = {
      formData: () => formdata,
    };

    const resp = await copyHandler({ req, env: {}, daCtx: { key: 'my/src.html' } });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(copyCalled.length, 0);

    const resp2 = await copyHandler({ req, env: {}, daCtx: { key: 'my/src2.html' } });
    assert.strictEqual(403, resp2.status);
    assert.strictEqual(copyCalled.length, 0);

    const formdata2 = new Map();
    formdata2.set('destination', '/myorg/MY/dest2.html');
    const req2 = {
      formData: () => formdata2,
    };

    const resp3 = await copyHandler({ req: req2, env: {}, daCtx: { key: 'my/src.html' } });
    assert.strictEqual(403, resp3.status);
    assert.strictEqual(copyCalled.length, 0);

    const resp4 = await copyHandler({ req: req2, env: {}, daCtx: { key: 'my/src2.html' } });
    assert.strictEqual(200, resp4.status);
    assert.strictEqual(copyCalled.length, 1);
    assert.strictEqual('my/src2.html', copyCalled[0].d.source);
    assert.strictEqual('my/dest2.html', copyCalled[0].d.destination);
    assert.strictEqual(false, copyCalled[0].m);
  });
});
