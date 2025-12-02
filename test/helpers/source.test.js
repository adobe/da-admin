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
import putHelper from '../../src/helpers/source.js';

import env from '../utils/mocks/env.js';

const daCtx = { org: 'cq', key: 'geometrixx/hello.html', propsKey: 'geometrixx/hello.html.props' };

const MOCK_URL = 'https://da.live/source/cq/geometrixx/hello';

describe('Source helper', () => {
  describe('Put success', async () => {
    it('Returns null if no content type', async () => {
      const req = new Request(MOCK_URL);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(helped, null);
    });

    it('Returns null if unsupported content type', async () => {
      const opts = {
        headers: new Headers({
          'Content-Type': 'custom/form; boundary',
        }),
      };

      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(helped, undefined);
    });

    it('Returns null if supported content type but no form data', async () => {
      const opts = {
        body: {},
        method: 'PUT',
        headers: new Headers({
          'Content-Type': 'multipart/form-data; boundary',
        }),
      };

      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(helped, null);
    });

    it('Returns empty object if no form data fields', async () => {
      const body = new FormData();

      const opts = {
        body,
        method: 'PUT',
        headers: new Headers({
          'Content-Type': 'application/x-www-form-urlencoded; boundary',
        }),
      };

      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(Object.keys(helped).length, 0);
    });

    it('Form with data field', async () => {
      const body = new FormData();
      body.append('data', 'foo');
      body.append('guid', '12345');

      const opts = { body, method: 'PUT' };
      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual('foo', helped.data);
      assert.strictEqual('12345', helped.guid);
    });
  });
});
