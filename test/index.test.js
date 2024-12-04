import assert from 'assert';
import handler from '../src/index.js';

describe('fetch', () => {
  it('should be callable', () => {
    assert(handler.fetch);
  });

  it('should return a response object for options', async () => {
    const resp = await handler.fetch({ method: 'OPTIONS' }, {});
    assert.strictEqual(resp.status, 204);
  });

  it('should return a response object for unknown', async () => {
    const resp = await handler.fetch({ url: 'https://www.example.com', method: 'BLAH' }, {});
    assert.strictEqual(resp.status, 501);
  });
});
