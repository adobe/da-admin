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

import daResp from '../../src/utils/daResp.js';

describe('DA Resp', () => {
  it('test 200 normal', async () => {
    const aclCtx = { actionSet: ['read', 'write'], pathLookup: new Map() };
    const ctx = { key: 'foo/bar.html', aclCtx };
    const body = 'foobar';
    const metadata = { id: '1234', LastModified: '2024-06-24T13:20:00.000Z' };

    const resp = daResp({
      status: 200, body, contentType: 'text/plain', contentLength: 777, metadata,
    }, ctx);
    assert.strictEqual(body, await resp.text());
    assert.strictEqual(200, resp.status);
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Origin'));
    assert.strictEqual('HEAD, GET, PUT, POST, DELETE', resp.headers.get('Access-Control-Allow-Methods'));
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Headers'));
    assert.strictEqual('X-da-actions, X-da-child-actions, X-da-acltrace, X-da-id, da-continuation-token, ETag', resp.headers.get('Access-Control-Expose-Headers'));
    assert.strictEqual('text/plain; charset=utf-8', resp.headers.get('Content-Type'));
    assert.strictEqual('777', resp.headers.get('Content-Length'));
    assert.strictEqual('/foo/bar.html=read,write', resp.headers.get('X-da-actions'));
    assert.strictEqual('1234', resp.headers.get('X-da-id'));
    assert.strictEqual('Mon, 24 Jun 2024 13:20:00 GMT', resp.headers.get('Last-Modified'));
    assert(resp.headers.get('X-da-acltrace') === null);
  });

  it('test 404 acltrace', () => {
    const actionTrace = { trace: 'value' };
    const aclCtx = { actionSet: ['read'], pathLookup: new Map(), actionTrace };
    const ctx = { key: 'foo/blah.html', aclCtx };
    const body = null;
    const metadata = {};

    const resp = daResp({ status: 404, body, metadata }, ctx);
    assert.strictEqual(404, resp.status);
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Origin'));
    assert.strictEqual('HEAD, GET, PUT, POST, DELETE', resp.headers.get('Access-Control-Allow-Methods'));
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Headers'));
    assert.strictEqual('X-da-actions, X-da-child-actions, X-da-acltrace, X-da-id, da-continuation-token, ETag', resp.headers.get('Access-Control-Expose-Headers'));
    assert.strictEqual('application/json', resp.headers.get('Content-Type'));
    assert(!resp.headers.get('Content-Length'));
    assert.strictEqual('/foo/blah.html=read', resp.headers.get('X-da-actions'));
    assert.deepStrictEqual(actionTrace, JSON.parse(resp.headers.get('X-da-acltrace')));
    assert(resp.headers.get('X-da-id') === null);
  });

  it('test 500', () => {
    const aclCtx = { actionSet: ['read', 'write'], pathLookup: new Map() };
    const ctx = { key: 'foo/blah.html', aclCtx };
    const resp = daResp({ status: 500 }, ctx);
    assert.strictEqual(500, resp.status);
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Origin'));
    assert.strictEqual('HEAD, GET, PUT, POST, DELETE', resp.headers.get('Access-Control-Allow-Methods'));
    assert.strictEqual('*', resp.headers.get('Access-Control-Allow-Headers'));
    assert(resp.headers.get('X-da-actions') === null);
    assert(resp.headers.get('X-da-child-actions') === null);
    assert(resp.headers.get('X-da-acltrace') === null);
    assert(resp.headers.get('X-da-id') === null);
  });

  it('normalizes text/html to include charset=utf-8', () => {
    const resp = daResp({ status: 200, body: '<h1>Hello</h1>', contentType: 'text/html' });
    assert.strictEqual('text/html; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('does not add charset to application/json', () => {
    const resp = daResp({ status: 200, body: '{}', contentType: 'application/json' });
    assert.strictEqual('application/json', resp.headers.get('Content-Type'));
  });

  it('does not add charset to image types', () => {
    const resp = daResp({ status: 200, body: null, contentType: 'image/png' });
    assert.strictEqual('image/png', resp.headers.get('Content-Type'));
  });

  it('does not double-add charset if already present', () => {
    const resp = daResp({ status: 200, body: '<h1>Hi</h1>', contentType: 'text/html; charset=utf-8' });
    assert.strictEqual('text/html; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('normalizes text/plain to include charset=utf-8', () => {
    const resp = daResp({ status: 200, body: 'Café résumé', contentType: 'text/plain' });
    assert.strictEqual('text/plain; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('normalizes text/xml to include charset=utf-8', () => {
    const resp = daResp({ status: 200, body: '<root/>', contentType: 'text/xml' });
    assert.strictEqual('text/xml; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('normalizes text/css to include charset=utf-8', () => {
    const resp = daResp({ status: 200, body: 'body {}', contentType: 'text/css' });
    assert.strictEqual('text/css; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('normalizes text/markdown to include charset=utf-8', () => {
    const resp = daResp({ status: 200, body: '# Hello', contentType: 'text/markdown' });
    assert.strictEqual('text/markdown; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('normalizes text/csv to include charset=utf-8', () => {
    const resp = daResp({ status: 200, body: 'a,b,c', contentType: 'text/csv' });
    assert.strictEqual('text/csv; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('does not add charset to application/octet-stream', () => {
    const resp = daResp({ status: 200, body: null, contentType: 'application/octet-stream' });
    assert.strictEqual('application/octet-stream', resp.headers.get('Content-Type'));
  });

  it('does not add charset to video/mp4', () => {
    const resp = daResp({ status: 200, body: null, contentType: 'video/mp4' });
    assert.strictEqual('video/mp4', resp.headers.get('Content-Type'));
  });

  it('does not double-add charset for text/plain with existing charset', () => {
    const resp = daResp({ status: 200, body: 'hello', contentType: 'text/plain; charset=utf-8' });
    assert.strictEqual('text/plain; charset=utf-8', resp.headers.get('Content-Type'));
  });

  it('test child actions header', () => {
    const aclCtx = { actionSet: ['read'], childRules: ['/haha/hoho/**=read,write'] };
    const ctx = { key: 'foo/bar.html', aclCtx };
    const resp = daResp({ status: 200, body: 'foobar' }, ctx);
    assert.strictEqual(200, resp.status);
    assert.strictEqual('X-da-actions, X-da-child-actions, X-da-acltrace, X-da-id, da-continuation-token, ETag', resp.headers.get('Access-Control-Expose-Headers'));
    assert.strictEqual('/haha/hoho/**=read,write', resp.headers.get('X-da-child-actions'));
  });
});
