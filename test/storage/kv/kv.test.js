import { describe, it, expect } from 'vitest';

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
    expect(resp.body).to.eq(MOCK_CONFIG);
    expect(resp.status).to.eq(200);
  });

  it('Get not found', async () => {
    const env = { DA_CONFIG: { get: () => { return null } } };
    const daCtx = { fullKey: 'adobe/geometrixx' };

    const resp = await getKv(env, daCtx);
    expect(resp.body).to.eq('{"error":"not found"}');
    expect(resp.status).to.eq(404);
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
    expect(resp.body).to.eq(MOCK_CONFIG);
    expect(resp.status).to.eq(201);
  });

  it('Put without form data', async () => {
    const req = { formData: () => { return null; } };
    const env = {};
    const daCtx = { fullKey: 'adobe/geometrixx' };
    const resp = await putKv(req, env, daCtx);
    expect(resp.body).to.eq('{"error":"No config or form data."}');
    expect(resp.status).to.eq(400);
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
    expect(resp.body).to.eq('{"error":"Couldn\'t parse or save config."}');
    expect(resp.status).to.eq(400);
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
    expect(resp.status).to.eq(201);
    expect(stored.length).to.eq(1);
    expect(stored[0]).to.eq(JSON.stringify(config));
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
    expect(resp.status).to.eq(201);
    expect(stored.length).to.eq(1);
    expect(stored[0]).to.eq(JSON.stringify(config));
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
    expect(resp.status).to.eq(400);
    const error = JSON.parse(resp.body);
    expect(error.error).to.eq('Should at least specify one user or group that has CONFIG write permission');
    expect(stored.length).to.eq(0);
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
    expect(resp.status).to.eq(400);
    const error = JSON.parse(resp.body);
    expect(error.error).to.eq('Should at least specify one user or group that has CONFIG write permission');
    expect(stored.length).to.eq(0);
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
    expect(resp.status).to.eq(201);
    expect(stored.length).to.eq(1);
    expect(stored[0]).to.eq(JSON.stringify(config));
  });
});
