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

import listOrgs from '../../../src/storage/org/list.js';

import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';

const daCtx = { users: [{email: 'aparker@geometrixx.info'}] };

describe('list orgs', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });
  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  it('Only authed and anon orgs are listed', async () => {
    const orgs = await listOrgs(env, daCtx);
    assert.strictEqual(orgs.length, 2);
    assert.strictEqual(orgs[0].name, 'geometrixx');
    assert.strictEqual(orgs[1].name, 'wknd');
  });

  it('Empty list if any errors', async () => {
    const orgs = await listOrgs(null, daCtx);
    assert.strictEqual(orgs.length, 0);
  });
});
