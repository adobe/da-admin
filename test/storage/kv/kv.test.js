import assert from 'assert';

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
        get: () => { return MOCK_CONFIG },
      }
    };
    const daCtx = { fullKey: 'adobe/geometrixx' };

    const resp = await getKv(env, daCtx);
    assert.strictEqual(resp.body, MOCK_CONFIG);
    assert.strictEqual(resp.status, 200);
  });

  it('Get not found', async () => {
    const env = { DA_CONFIG: { get: () => { return null } } };
    const daCtx = { fullKey: 'adobe/geometrixx' };

    const resp = await getKv(env, daCtx);
    assert.strictEqual(resp.body, '{"error":"not found"}');
    assert.strictEqual(resp.status, 404);
  });

  it('Put success', async () => {
    const formData = new FormData();
    formData.append('config', MOCK_CONFIG);

    const req = { formData: () => { return formData; } };
    const env = {
      DA_CONFIG: {
        put: () => { return undefined },
        get: () => { return MOCK_CONFIG },
      }
    };
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    assert.strictEqual(resp.body, MOCK_CONFIG);
    assert.strictEqual(resp.status, 201);
  });

  it('Put without form data', async () => {
    const req = { formData: () => { return null; } };
    const env = {};
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    assert.strictEqual(resp.body, '{"error":"No config or form data."}');
    assert.strictEqual(resp.status, 400);
  });

  it('Put with malformed config', async () => {
    const formData = new FormData();
    formData.append('config', 'abc');

    const req = { formData: () => { return formData; } };
    const env = {
      DA_CONFIG: {
        put: () => { return undefined },
        get: () => { return MOCK_CONFIG },
      }
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
      ]
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => { return formData; } };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => { return "dummy"; }
      }
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
        ]
      },
      blah: {}
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => { return formData; } };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => { return "dummy"; }
      }
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
        { path: 'CONFIG', actions: 'read', groups: 'me@foo.org' }
      ]
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => { return formData; } };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => { return "dummy"; }
      }
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
          { path: 'CONFIG', actions: 'read', groups: 'me@foo.org' }
        ],
      },
      foo: {}
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => { return formData; } };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => { return "dummy"; }
      }
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
      data: []
    };
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const req = { formData: () => { return formData; } };
    const stored = [];
    const env = {
      DA_CONFIG: {
        put: (key, value) => { stored.push(value); },
        get: (key) => { return "dummy"; }
      }
    };

    const resp = await putKv(req, env, {});
    assert.strictEqual(resp.status, 201);
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0], JSON.stringify(config));
  });
});
