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

describe('Copy Handler', () => {
  const params = { req: {}, env: {}, daCtx: {} }
  it('handles valid request', async () => {
    const copyHandler = await esmock('../../src/routes/copy.js', {
      '../../src/helpers/copy.js': {
        default: async () => ({ source: 'mydir', destination: 'mydir' })
      },
      '../../src/storage/object/copy.js': {
        default: async () => ({ status: 201 })
      }
    });
    const resp = await copyHandler(params);
    assert.deepStrictEqual(resp, { status: 201 });
  });
});
