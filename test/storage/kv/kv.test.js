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
/* eslint-disable no-unused-vars */
import assert from 'node:assert';

import getKv from '../../../src/storage/kv/get.js';
import putKv from '../../../src/storage/kv/put.js';

const MOCK_CONFIG = `{
  "total": 1,
  "limit": 1,
  "offset": 0,
  "data": [
      {
          "key": "admin.role.all",
          "value": "aparker@geometrixx.info"
      }
  ],
  ":type": "sheet"
}`;

describe('KV storage', () => {
  it('Get success', async () => {
    const env = {
      DA_CONFIG: {
        get: () => MOCK_CONFIG,
      },
    };
    const daCtx = { fullKey: 'adobe/geometrixx' };

    const resp = await getKv(env, daCtx);
    assert.strictEqual(resp.body, MOCK_CONFIG);
    assert.strictEqual(resp.status, 200);
  });

  it('Get not found', async () => {
    const env = { DA_CONFIG: { get: () => null } };
    const daCtx = { fullKey: 'adobe/geometrixx' };

    const resp = await getKv(env, daCtx);
    assert.strictEqual(resp.body, '{"error":"not found"}');
    assert.strictEqual(resp.status, 404);
  });

  it('Put success', async () => {
    const formData = new FormData();
    formData.append('config', MOCK_CONFIG);

    const req = { formData: () => formData };
    const env = {
      DA_CONFIG: {
        put: () => undefined,
        get: () => MOCK_CONFIG,
      },
    };
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    assert.strictEqual(resp.body, MOCK_CONFIG);
    assert.strictEqual(resp.status, 201);
  });

  it('Put without form data', async () => {
    const req = { formData: () => null };
    const env = {};
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    assert.strictEqual(resp.body, '{"error":"No config or form data."}');
    assert.strictEqual(resp.status, 400);
  });

  it('Put with malformed config', async () => {
    const formData = new FormData();
    formData.append('config', 'abc');

    const req = { formData: () => formData };
    const env = {
      DA_CONFIG: {
        put: () => undefined,
        get: () => MOCK_CONFIG,
      },
    };
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    assert.strictEqual(resp.body, '{"error":"Couldn\'t parse or save config."}');
    assert.strictEqual(resp.status, 400);
  });
});

describe('Validate permission sheet', () => {
  it('Check that put is successful when CONFIG write permission is set', async () => {
    const config = {
      ':sheetname': 'permissions',
      ':type': 'sheet',
      data: [
        { path: '/+*', actions: 'read', groups: 'me@foo.org' },
        { path: 'CONFIG', actions: 'read', groups: 'hi@foo.org' },
        { path: 'CONFIG', actions: 'write', groups: 'me@foo.org' },
      ],
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => formData };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => 'dummy',
      },
    };

    const resp = await putKv(req, env, {});
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0], JSON.stringify(config));
  });

  it('Check that put is successful when CONFIG write permission is set - multisheet', async () => {
    const config = {
      permissions: {
        data: [
          { path: '/+*', actions: 'read', groups: 'me@foo.org' },
          { path: 'CONFIG', actions: 'read', groups: 'hi@foo.org' },
          { path: 'CONFIG', actions: 'write', groups: 'me@foo.org' },
        ],
      },
      blah: {},
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => formData };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => 'dummy',
      },
    };

    const resp = await putKv(req, env, {});
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0], JSON.stringify(config));
  });

  it('Check that put is not successful when CONFIG write permission is missing', async () => {
    const config = {
      ':sheetname': 'permissions',
      ':type': 'sheet',
      data: [
        { path: '/+*', actions: 'write', groups: 'me@foo.org' },
        { path: 'CONFIG', actions: 'read', groups: 'me@foo.org' },
      ],
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => formData };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => 'dummy',
      },
    };

    const resp = await putKv(req, env, {});
    assert.strictEqual(resp.status, 400);
    const error = JSON.parse(resp.body);
    assert.strictEqual(error.error, 'Should at least specify one user or group that has CONFIG write permission');
    assert.strictEqual(stored.length, 0);
  });

  it('Check that put is not successful when CONFIG write permission is missing - multisheet', async () => {
    const config = {
      permissions: {
        data: [
          { path: '/+*', actions: 'write', groups: 'me@foo.org' },
          { path: 'CONFIG', actions: 'read', groups: 'me@foo.org' },
        ],
      },
      foo: {},
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => formData };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => 'dummy',
      },
    };

    const resp = await putKv(req, env, {});
    assert.strictEqual(resp.status, 400);
    const error = JSON.parse(resp.body);
    assert.strictEqual(error.error, 'Should at least specify one user or group that has CONFIG write permission');
    assert.strictEqual(stored.length, 0);
  });

  it('Check that put is successful if permission sheet is not there', async () => {
    const config = {
      ':sheetname': 'other',
      ':type': 'sheet',
      data: [],
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => formData };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => 'dummy',
      },
    };

    const resp = await putKv(req, env, {});
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0], JSON.stringify(config));
  });
});
