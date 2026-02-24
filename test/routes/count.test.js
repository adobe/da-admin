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

describe('Count Route', () => {
  it('returns total for folder with subfolders', async () => {
    const getCount = await esmock('../../src/routes/count.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: () => ({}) },
      '../../src/storage/utils/list.js': {
        listAllKeys: async () => ['folder', 'folder.props', 'folder/a.html', 'folder/b.html'],
      },
    });

    const resp = await getCount({ env: {}, daCtx: { key: 'folder' } });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(JSON.parse(resp.body).total, 4);
  });

  it('returns 1 for single file', async () => {
    const getCount = await esmock('../../src/routes/count.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
    });

    const resp = await getCount({ env: {}, daCtx: { key: 'file.html', ext: 'html' } });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(JSON.parse(resp.body).total, 1);
  });

  it('returns 403 without read permission', async () => {
    const getCount = await esmock('../../src/routes/count.js', {
      '../../src/utils/auth.js': { hasPermission: () => false },
    });

    const resp = await getCount({ env: {}, daCtx: { key: 'folder' } });
    assert.strictEqual(resp.status, 403);
  });
});
