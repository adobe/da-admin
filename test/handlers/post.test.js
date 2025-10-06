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

import postHandler from '../../src/handlers/post.js';

describe('Post Route', () => {
  it('Test logout', async () => {
    const deleteCalled = [];
    const DA_AUTH = {
      delete: (key) => deleteCalled.push(key),
    };
    const env = { DA_AUTH };
    const daCtx = {
      path: '/logout',
      users: [ { ident: 'foo@bar.org'}, { ident: 'blah@blah.org' }]
    };

    const resp = await postHandler({ env, daCtx });
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(deleteCalled.length, 2);
    assert(deleteCalled.includes('foo@bar.org'));
    assert(deleteCalled.includes('blah@blah.org'));
  });

  it('Test media route', async () => {
    const mediaCalled = [];
    const mockPostMedia = async ({ req, env, daCtx }) => {
      mediaCalled.push({ req, env, daCtx });
      return { status: 200, body: JSON.stringify({ id: 'media-123' }) };
    };

    const postHandlerWithMock = await esmock('../../src/handlers/post.js', {
      '../../src/routes/media.js': {
        default: mockPostMedia,
      },
    });

    const req = { method: 'POST' };
    const env = { AEM_ADMIN_MEDIA_API: 'https://api.example.com' };
    const daCtx = {
      path: '/media/image.jpg',
      key: 'test/image.jpg',
    };

    const resp = await postHandlerWithMock.default({ req, env, daCtx });
    
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(mediaCalled.length, 1);
    assert.strictEqual(mediaCalled[0].req, req);
    assert.strictEqual(mediaCalled[0].env, env);
    assert.strictEqual(mediaCalled[0].daCtx, daCtx);
  });

  it('Test unknown route returns undefined', async () => {
    const req = { method: 'POST' };
    const env = {};
    const daCtx = {
      path: '/unknown/route',
      key: 'test/unknown',
    };

    const resp = await postHandler({ req, env, daCtx });
    
    assert.strictEqual(resp, undefined);
  });
});
