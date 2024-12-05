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

import assert from 'assert';
import handler from '../src/index.js';

describe('fetch', () => {
  it('should be callable', () => {
    assert(handler.fetch);
  });

  it('should return a response object for options', async () => {
    const resp = await handler.fetch({ method: 'OPTIONS' }, {});
    assert.strictEqual(resp.status, 204);
  });

  it('should return a response object for unknown', async () => {
    const resp = await handler.fetch({ url: 'https://www.example.com', method: 'BLAH' }, {});
    assert.strictEqual(resp.status, 501);
  });
});
