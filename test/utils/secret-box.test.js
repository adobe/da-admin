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
import { seal, unseal } from '../../src/utils/secret-box.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('secret-box', () => {
  it('round-trips a value without storing it in plain text', async () => {
    const sealed = await seal(KEY, { clientSecret: 'shh' });
    assert.doesNotMatch(sealed, /shh/);
    assert.deepStrictEqual(await unseal(KEY, sealed), { clientSecret: 'shh' });
  });

  it('rejects tampered data and the wrong key', async () => {
    const sealed = JSON.parse(await seal(KEY, { a: 1 }));
    const bytes = Buffer.from(sealed.data, 'base64');
    bytes[0] = bytes[0] === 0 ? 1 : 0;
    const tampered = JSON.stringify({ ...sealed, data: bytes.toString('base64') });
    await assert.rejects(() => unseal(KEY, tampered));
    await assert.rejects(() => unseal(Buffer.alloc(32, 8).toString('base64'), JSON.stringify(sealed)));
  });

  it('fails without a key', async () => {
    await assert.rejects(() => seal(undefined, {}), /not configured/);
  });
});
