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
import assert from 'assert';
import esmock from 'esmock';

import daResp from '../../src/utils/daResp.js';

describe('DA Resp', () => {
  it('test 200 normal', async () => {
    const aclCtx = { actionSet: ['read', 'write'], pathLookup: new Map() };
    const ctx = { key: 'foo/bar.html', aclCtx };
    const body = 'foobar';

    const resp = daResp({status: 200, body, contentType: 'text/plain', contentLength: 777}, ctx);
    assert.strictEqual(body, await resp.text());
    assert.strictEqual(200, resp.status);
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Origin'));
    assert.strictEqual('HEAD, GET, PUT, POST, DELETE', resp.headers.get('Access-Control-Allow-Methods'));
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Headers'));
    assert.strictEqual('X-da-actions, X-da-child-actions, X-da-acltrace', resp.headers.get('Access-Control-Expose-Headers'));
    assert.strictEqual('text/plain', resp.headers.get('Content-Type'));
    assert.strictEqual('777', resp.headers.get('Content-Length'));
    assert.strictEqual('/foo/bar.html=read,write', resp.headers.get('X-da-actions'));
    assert(resp.headers.get('X-da-acltrace') === null);
  });

  it('test 404 acltrace', () => {
    const actionTrace = { trace: 'value' };
    const aclCtx = { actionSet: ['read'], pathLookup: new Map(), actionTrace };
    const ctx = { key: 'foo/blah.html', aclCtx };
    const body = null;

    const resp = daResp({status: 404, body}, ctx);
    assert.strictEqual(404, resp.status);
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Origin'));
    assert.strictEqual('HEAD, GET, PUT, POST, DELETE', resp.headers.get('Access-Control-Allow-Methods'));
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Headers'));
    assert.strictEqual('X-da-actions, X-da-child-actions, X-da-acltrace', resp.headers.get('Access-Control-Expose-Headers'));
    assert.strictEqual('application/json', resp.headers.get('Content-Type'));
    assert(!resp.headers.get('Content-Length'));
    assert.strictEqual('/foo/blah.html=read', resp.headers.get('X-da-actions'));
    assert.deepStrictEqual(actionTrace, JSON.parse(resp.headers.get('X-da-acltrace')));
  });

  it('test 500', () => {
    const aclCtx = { actionSet: ['read', 'write'], pathLookup: new Map() };
    const ctx = { key: 'foo/blah.html', aclCtx };
    const resp = daResp({status: 500}, ctx);
    assert.strictEqual(500, resp.status);
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Origin'));
    assert.strictEqual('HEAD, GET, PUT, POST, DELETE', resp.headers.get('Access-Control-Allow-Methods'));
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Headers'));
    assert(resp.headers.get('X-da-actions') === null);
    assert(resp.headers.get('X-da-acltrace') === null);
  });
});
