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
  describe('Get success', async () => {
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

  describe('Get not found', async () => {
    const env = { DA_CONFIG: { get: () => { return null } } };
    const daCtx = { fullKey: 'adobe/geometrixx' };

    const resp = await getKv(env, daCtx);
    assert.strictEqual(resp.body, '{"error":"not found"}');
    assert.strictEqual(resp.status, 404);
  });

  describe('Put success', async () => {
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

  describe('Put without form data', async () => {
    const req = { formData: () => { return null; } };
    const env = {};
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    assert.strictEqual(resp.body, '{"error":"No config or form data."}');
    assert.strictEqual(resp.status, 400);
  });

  describe('Put with malformed config', async () => {
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
