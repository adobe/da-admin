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
/* eslint-env mocha */
import assert from 'node:assert';
import { strict as esmock } from 'esmock';

// Mocks
import reqs from './mocks/req.js';
import env from './mocks/env.js';
import auth from './mocks/auth.js';

const getDaCtx = await esmock('../../src/utils/daCtx.js', { '../../src/utils/auth.js': auth });

describe('DA context', () => {
  describe('API context', async () => {
    let daCtx;

    before(async () => {
      daCtx = await getDaCtx(reqs.api, env);
    });

    it('should remove api from path name', () => {
      assert.strictEqual(daCtx.api, 'source');
    });
  });

  describe('Endpoint context', async () => {
    let daCtx;
    let daCtxNoTrail;

    before(async () => {
      daCtx = await getDaCtx(reqs.endpoint, env);
      daCtxNoTrail = await getDaCtx(reqs.endpointNoTrail, env);
    });

    it('should support endpoint paths', () => {
      assert.strictEqual(daCtx.api, 'endpoint');
      assert.strictEqual(daCtxNoTrail.api, 'endpoint');
    });
  });

  describe('Org context', async () => {
    let daCtx;
    let daCtxNoTrail;

    before(async () => {
      daCtx = await getDaCtx(reqs.org, env);
      daCtxNoTrail = await getDaCtx(reqs.orgNoTrail, env);
    });

    it('should return an undefined site', () => {
      assert.strictEqual(daCtx.site, undefined);
      assert.strictEqual(daCtxNoTrail.site, undefined);
    });

    it('should return a blank filename', () => {
      assert.strictEqual(daCtx.filename, '');
      assert.strictEqual(daCtxNoTrail.filename, '');
    });
  });

  describe('Site context', () => {
    let daCtx;

    before(async () => {
      daCtx = await getDaCtx(reqs.site, env);
    });

    it('should return a props key', () => {
      assert.strictEqual(daCtx.propsKey, 'geometrixx.props');
    });
  });

  describe('Sanitize string', async () => {
    let daCtx;

    before(async () => {
      daCtx = await getDaCtx(reqs.file, env);
    });

    it('should return a lowercase key', () => {
      assert.strictEqual(daCtx.site, 'geometrixx');
    });
  });

  describe('Folder context', async () => {
    let daCtx;

    before(async () => {
      daCtx = await getDaCtx(reqs.folder, env);
    });

    it('should return an api', () => {
      assert.strictEqual(daCtx.api, 'source');
    });

    it('should return an owner', () => {
      assert.strictEqual(daCtx.org, 'cq');
    });

    it('should return a key', () => {
      assert.strictEqual(daCtx.key, 'geometrixx/nft');
    });

    it('should return a props key', () => {
      assert.strictEqual(daCtx.propsKey, 'geometrixx/nft.props');
    });

    it('should not have an extension', () => {
      assert.strictEqual(daCtx.ext, undefined);
    });
  });

  describe('File context', async () => {
    let daCtx;

    before(async () => {
      daCtx = await getDaCtx(reqs.file, env);
    });

    it('should return a name', () => {
      assert.strictEqual(daCtx.name, 'outreach');
    });

    it('should return an extension', () => {
      assert.strictEqual(daCtx.ext, 'html');
    });

    it('should return a props key', () => {
      assert.strictEqual(daCtx.propsKey, 'geometrixx/nft/outreach.html.props');
    });

    it('should not return an extension in path', () => {
      assert.strictEqual(daCtx.pathname, '/geometrixx/nft/outreach');
      assert.strictEqual(daCtx.aemPathname, '/nft/outreach');
    });
  });

  describe('Media context', async () => {
    let daCtx;

    before(async () => {
      daCtx = await getDaCtx(reqs.media, env);
    });

    it('should return a props key', () => {
      assert.strictEqual(daCtx.pathname, '/geometrixx/nft/blockchain.png');
      assert.strictEqual(daCtx.aemPathname, '/nft/blockchain.png');
    });
  });

  describe('Conditional headers', async () => {
    it('should extract If-Match header', async () => {
      const req = {
        url: 'http://localhost:8787/source/org/site/file.html',
        headers: {
          get: (name) => {
            if (name === 'if-match') return '"etag123"';
            return null;
          },
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.conditionalHeaders.ifMatch, '"etag123"');
      assert.strictEqual(daCtx.conditionalHeaders.ifNoneMatch, null);
    });

    it('should extract If-None-Match header', async () => {
      const req = {
        url: 'http://localhost:8787/source/org/site/file.html',
        headers: {
          get: (name) => {
            if (name === 'if-none-match') return '*';
            return null;
          },
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.conditionalHeaders.ifNoneMatch, '*');
      assert.strictEqual(daCtx.conditionalHeaders.ifMatch, null);
    });

    it('should handle both headers', async () => {
      const req = {
        url: 'http://localhost:8787/source/org/site/file.html',
        headers: {
          get: (name) => {
            if (name === 'if-match') return '"abc"';
            if (name === 'if-none-match') return '"xyz"';
            return null;
          },
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.conditionalHeaders.ifMatch, '"abc"');
      assert.strictEqual(daCtx.conditionalHeaders.ifNoneMatch, '"xyz"');
    });

    it('should handle missing headers', async () => {
      const req = {
        url: 'http://localhost:8787/source/org/site/file.html',
        headers: {
          get: () => null,
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.conditionalHeaders.ifMatch, null);
      assert.strictEqual(daCtx.conditionalHeaders.ifNoneMatch, null);
    });
  });

  describe('Continuation token', async () => {
    it('should extract da-continuation-token header', async () => {
      const req = {
        url: 'http://localhost:8787/list/org/site/path',
        headers: {
          get: (name) => {
            if (name === 'da-continuation-token') return 'header-token';
            return null;
          },
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.continuationToken, 'header-token');
    });

    it('should ignore continuation-token query param when header is present', async () => {
      const req = {
        url: 'http://localhost:8787/list/org/site/path?continuation-token=query-token',
        headers: {
          get: (name) => {
            if (name === 'da-continuation-token') return 'header-token';
            return null;
          },
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.continuationToken, 'header-token');
    });

    it('should ignore continuation-token query param', async () => {
      const req = {
        url: 'http://localhost:8787/list/org/site/path?continuation-token=token123',
        headers: {
          get: () => null,
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.continuationToken, null);
    });

    it('should default continuation token to null', async () => {
      const req = {
        url: 'http://localhost:8787/list/org/site/path',
        headers: {
          get: () => null,
        },
      };
      const daCtx = await getDaCtx(req, env);
      assert.strictEqual(daCtx.continuationToken, null);
    });
  });
});
