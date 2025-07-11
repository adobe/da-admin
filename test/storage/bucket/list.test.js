import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import listBuckets from '../../../src/storage/bucket/list.js';

describe('List', () => {
  const aclCtx = {
    pathLookup: new Map()
  };
  const daCtx = { users: [{email: 'aparker@geometrixx.info'}], aclCtx };

  /* This test has to be rewritten
  describe('Lists authed buckets', async () => {
    const bucketsResp = await listBuckets(env, daCtx);
    const buckets = JSON.parse(bucketsResp.body);

    it('Only authed and anon buckets are listed', () => {
      expect(buckets.length).to.eq(2);
    });
  });
  */

  describe('404s on any error', () => {
    it('Dies on null env', async () => {
      const bucketsResp = await listBuckets(null, daCtx);
      expect(bucketsResp.status).to.eq(404);
    });
  });
});
