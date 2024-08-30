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

describe('Rename Route', () => {
  const params = { req: {}, env: {}, daCtx: {} }
  it('handles valid request', async () => {
    const expected = { status: 201 }
    const renameHandler = await esmock('../../src/routes/rename.js', {
      '../../src/helpers/rename.js': {
        default: async () => ({ source: 'mydir', destination: 'newdir' })
      },
      '../../src/storage/object/rename.js': {
        default: async () => expected
      }
    });
    const resp = await renameHandler(params);
    assert.equal(resp, expected);
  });
});
