import assert from 'assert';
import listBuckets from '../../../src/storage/bucket/list.js';
import env from './mocks/env.js';

describe('List', () => {
  const daCtx = { users: [{email: 'aparker@geometrixx.info'}] };

  describe('Lists authed buckets', async () => {
    const bucketsResp = await listBuckets(env, daCtx);
    const buckets = JSON.parse(bucketsResp.body);

    it('Only authed and anon buckets are listed', () => {
      assert.strictEqual(buckets.length, 2);
    });
  });

  describe('404s on any error', () => {
    it('Dies on null env', async () => {
      const bucketsResp = await listBuckets(null, daCtx);
      assert.strictEqual(bucketsResp.status, 404);
    });
  });
});
