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
import esmock from 'esmock';

describe('Move Route', () => {
  it('Test moveRoute with permissions', async () => {
    const moCalled = [];
    const moveObject = (e, c, d) => {
      moCalled.push({ e, c, d });
    };

    const hasPermission = (c, k, a) => {
      if (k === 'abc.html' && a === 'write') {
        return false;
      }
      if (k === 'somedest' && a === 'write') {
        return false;
      }
      return true;
    };

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/storage/object/move.js': {
        default: moveObject,
      },
      '../../src/utils/auth.js': {
        hasPermission,
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/somedest/');
    const req = {
      formData: () => formdata,
    };

    const resp = await moveRoute({ req, env: {}, daCtx: { org: 'someorg', key: 'abc.html' } });
    assert.strictEqual(403, resp.status);
    assert.strictEqual(0, moCalled.length);

    const resp2 = await moveRoute({ req, env: {}, daCtx: { org: 'someorg', key: 'zzz.html' } });
    assert.strictEqual(403, resp2.status);
    assert.strictEqual(0, moCalled.length);

    const formdata2 = new Map();
    formdata2.set('destination', '/someorg/someotherdest/');
    const req2 = {
      formData: () => formdata2,
    };

    const resp3 = await moveRoute({ req: req2, env: {}, daCtx: { org: 'someorg', key: 'abc.html' } });
    assert.strictEqual(403, resp3.status);
    assert.strictEqual(0, moCalled.length);

    await moveRoute({ req: req2, env: {}, daCtx: { org: 'someorg', key: 'zzz.html' } });
    assert.strictEqual(1, moCalled.length);
    assert.strictEqual('zzz.html', moCalled[0].d.source);
    assert.strictEqual('someotherdest', moCalled[0].d.destination);
  });

  it('Test moveRoute returns 400 when destination org differs from request org', async () => {
    const moCalled = [];
    const moveObject = (e, c, d) => {
      moCalled.push({ e, c, d });
    };

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/storage/object/move.js': {
        default: moveObject,
      },
      '../../src/utils/auth.js': {
        hasPermission: () => true,
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/otherorg/somedest/');
    const req = {
      formData: () => formdata,
    };

    const resp = await moveRoute({ req, env: {}, daCtx: { org: 'someorg', key: 'abc.html' } });
    assert.strictEqual(resp.status, 400);
    assert.strictEqual(0, moCalled.length);
    const body = JSON.parse(resp.body);
    assert.match(body.error, /same org/i);
  });

  it('Test moveRoute accepts a same-org destination regardless of case', async () => {
    const moCalled = [];
    const moveObject = (e, c, d) => {
      moCalled.push({ e, c, d });
      return { status: 204 };
    };

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/storage/object/move.js': {
        default: moveObject,
      },
      '../../src/utils/auth.js': {
        hasPermission: () => true,
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/SomeOrg/somedest/');
    const req = {
      formData: () => formdata,
    };

    const resp = await moveRoute({ req, env: {}, daCtx: { org: 'someorg', key: 'abc.html' } });
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(1, moCalled.length);
    assert.strictEqual('somedest', moCalled[0].d.destination);
  });

  it('Test moveRoute returns 400 when destination is in the reserved .da-versions folder', async () => {
    const moCalled = [];
    const moveObject = (e, c, d) => {
      moCalled.push({ e, c, d });
      return { status: 200 };
    };

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/storage/object/move.js': {
        default: moveObject,
      },
      '../../src/utils/auth.js': {
        hasPermission: () => true,
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/my/.da-versions/1234/audit-9999999999.txt');
    const req = {
      formData: () => formdata,
    };

    const resp = await moveRoute({ req, env: {}, daCtx: { org: 'someorg', key: 'my/decoy.html' } });
    assert.strictEqual(resp.status, 400);
    assert.strictEqual(0, moCalled.length);
    const body = JSON.parse(resp.body);
    assert.match(body.error, /da-versions/i);
  });

  it('Test moveRoute allows a destination segment that merely contains da-versions', async () => {
    const moCalled = [];
    const moveObject = (e, c, d) => {
      moCalled.push({ e, c, d });
      return { status: 204 };
    };

    const moveRoute = await esmock('../../src/routes/move.js', {
      '../../src/storage/object/move.js': {
        default: moveObject,
      },
      '../../src/utils/auth.js': {
        hasPermission: () => true,
      },
    });

    const formdata = new Map();
    formdata.set('destination', '/someorg/my/my-da-versions-notes.html');
    const req = {
      formData: () => formdata,
    };

    const resp = await moveRoute({ req, env: {}, daCtx: { org: 'someorg', key: 'abc.html' } });
    assert.strictEqual(resp.status, 204);
    assert.strictEqual(1, moCalled.length);
    assert.strictEqual(moCalled[0].d.destination, 'my/my-da-versions-notes.html');
  });
});
