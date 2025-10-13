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

describe('Media Route', () => {
  it('returns 403 when user lacks write permission', async () => {
    const hasPermission = () => false;

    const postMedia = await esmock('../../src/routes/media.js', {
      '../../src/utils/auth.js': {
        hasPermission,
      },
    });

    const req = {};
    const env = {};
    const daCtx = { key: '/test/image.jpg' };

    const resp = await postMedia.default({ req, env, daCtx });
    assert.strictEqual(resp.status, 403);
  });

  it('returns 400 for unsupported media type', async () => {
    const hasPermission = () => true;
    const putHelper = async () => ({ data: { type: 'text/plain' } });
    const getFileBody = async (data) => ({ body: data, type: data.type });

    const postMedia = await esmock('../../src/routes/media.js', {
      '../../src/utils/auth.js': {
        hasPermission,
      },
      '../../src/helpers/source.js': {
        putHelper,
        getFileBody,
      },
    });

    const req = {};
    const env = {};
    const daCtx = { key: '/test/document.txt' };

    const resp = await postMedia.default({ req, env, daCtx });
    assert.strictEqual(resp.status, 400);
  });

  it('successfully uploads supported media type', async () => {
    const hasPermission = () => true;
    const putHelper = async () => ({ data: { type: 'image/jpeg' } });
    const getFileBody = async (data) => ({ body: 'binary-image-data', type: data.type });

    // Mock fetch to simulate successful API response
    const originalFetch = globalThis.fetch;
    const fetchCalls = [];
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ id: 'media-123', url: 'https://example.com/media/123' }),
      };
    };

    try {
      const postMedia = await esmock('../../src/routes/media.js', {
        '../../src/utils/auth.js': {
          hasPermission,
        },
        '../../src/helpers/source.js': {
          putHelper,
          getFileBody,
        },
      });

      const req = {};
      const env = {
        AEM_ADMIN_MEDIA_API: 'https://api.example.com/media',
        AEM_ADMIN_MEDIA_API_KEY: 'test-api-key',
      };
      const daCtx = { 
        key: '/test/image.jpg',
        fullKey: 'org/test/image.jpg'
      };

      const resp = await postMedia.default({ req, env, daCtx });

      // Verify response
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(resp.contentType, 'application/json');
      const responseData = JSON.parse(resp.body);
      assert.strictEqual(responseData.id, 'media-123');
      assert.strictEqual(responseData.url, 'https://example.com/media/123');

      // Verify API call
      assert.strictEqual(fetchCalls.length, 1);
      const call = fetchCalls[0];
      assert.strictEqual(call.url, 'https://api.example.com/media/org/test/image.jpg/main');
      assert.strictEqual(call.options.method, 'POST');
      assert.strictEqual(call.options.headers['Content-Type'], 'image/jpeg');
      assert.strictEqual(call.options.headers.Authorization, 'token test-api-key');
      assert.strictEqual(call.options.body, 'binary-image-data');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles API error responses', async () => {
    const hasPermission = () => true;
    const putHelper = async () => ({ data: { type: 'image/png' } });
    const getFileBody = async (data) => ({ body: 'png-data', type: data.type });

    // Mock fetch to simulate API error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
    });

    try {
      const postMedia = await esmock('../../src/routes/media.js', {
        '../../src/utils/auth.js': {
          hasPermission,
        },
        '../../src/helpers/source.js': {
          putHelper,
          getFileBody,
        },
      });

      const req = {};
      const env = {
        AEM_ADMIN_MEDIA_API: 'https://api.example.com/media',
        AEM_ADMIN_MEDIA_API_KEY: 'test-api-key',
      };
      const daCtx = { 
        key: '/test/image.png',
        fullKey: 'org/test/image.png'
      };

      const resp = await postMedia.default({ req, env, daCtx });
      assert.strictEqual(resp.status, 500);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports all defined media types', async () => {
    const hasPermission = () => true;
    const putHelper = async () => ({ data: { type: 'video/mp4' } });
    const getFileBody = async (data) => ({ body: 'video-data', type: data.type });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ id: 'video-123' }),
    });

    try {
      const postMedia = await esmock('../../src/routes/media.js', {
        '../../src/utils/auth.js': {
          hasPermission,
        },
        '../../src/helpers/source.js': {
          putHelper,
          getFileBody,
        },
      });

      const req = {};
      const env = {
        AEM_ADMIN_MEDIA_API: 'https://api.example.com/media',
        AEM_ADMIN_MEDIA_API_KEY: 'test-key',
      };
      const daCtx = { 
        key: '/test/video.mp4',
        fullKey: 'org/test/video.mp4'
      };

      const resp = await postMedia.default({ req, env, daCtx });
      assert.strictEqual(resp.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles different supported image formats', async () => {
    const supportedTypes = ['image/jpeg', 'image/gif', 'image/png', 'image/svg+xml', 'image/webp'];
    
    for (const contentType of supportedTypes) {
      const hasPermission = () => true;
      const putHelper = async () => ({ data: { type: contentType } });
      const getFileBody = async (data) => ({ body: 'image-data', type: data.type });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ id: 'image-123' }),
      });

      try {
        const postMedia = await esmock('../../src/routes/media.js', {
          '../../src/utils/auth.js': {
            hasPermission,
          },
          '../../src/helpers/source.js': {
            putHelper,
            getFileBody,
          },
        });

        const req = {};
        const env = {
          AEM_ADMIN_MEDIA_API: 'https://api.example.com/media',
          AEM_ADMIN_MEDIA_API_KEY: 'test-key',
        };
        const daCtx = { 
          key: `/test/image.${contentType.split('/')[1]}`,
          fullKey: `org/test/image.${contentType.split('/')[1]}`
        };

        const resp = await postMedia.default({ req, env, daCtx });
        assert.strictEqual(resp.status, 200, `Failed for content type: ${contentType}`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });
});
