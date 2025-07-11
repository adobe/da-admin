import assert from 'assert';
import { describe, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Mocks
import reqs from './mocks/req.js';
import env from './mocks/env.js';
import auth from './mocks/auth.js';

vi.mock('../../src/utils/auth.js', () => ({
  ...auth
}));
import getDaCtx from '../../src/utils/daCtx.js';

describe('DA context', () => {
  describe('API context', () => {
    let daCtx;

    beforeAll(async () => {
      daCtx = await getDaCtx(reqs.api, env);
    });

    it('should remove api from path name', () => {
      assert.strictEqual(daCtx.api, 'source');
    });
  });

  describe('Org context', () => {
    let daCtx;

    beforeAll(async () => {
      daCtx = await getDaCtx(reqs.org, env);
    });

    it('should return an undefined site', () => {
      assert.strictEqual(daCtx.site, undefined);
    });

    it('should return a blank filename', () => {
      assert.strictEqual(daCtx.filename, '');
    });
  });

  describe('Site context', () => {
    let daCtx;

    beforeAll(async () => {
      daCtx = await getDaCtx(reqs.site, env);
    });

    it('should return a props key', () => {
      assert.strictEqual(daCtx.propsKey, 'geometrixx.props');
    });
  });

  describe('Sanitize string', () => {
    let daCtx;

    beforeAll(async () => {
      daCtx = await getDaCtx(reqs.file, env);
    });

    it('should return a lowercase key', () => {
      assert.strictEqual(daCtx.site, 'geometrixx');
    });
  });

  describe('Folder context', () => {
    let daCtx;

    beforeAll(async () => {
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

  describe('File context', () => {
    let daCtx;

    beforeAll(async () => {
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

  describe('Media context', () => {
    let daCtx;

    beforeAll(async () => {
      daCtx = await getDaCtx(reqs.media, env);
    });

    it('should return a props key', () => {
      assert.strictEqual(daCtx.pathname, '/geometrixx/nft/blockchain.png');
      assert.strictEqual(daCtx.aemPathname, '/nft/blockchain.png');
    });
  });
});
