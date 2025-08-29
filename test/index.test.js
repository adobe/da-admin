import assert from 'assert';
import esmock from 'esmock';
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

  it('should return 401 when not authorized and not logged in', async () => {
    const hnd = await esmock(
      '../src/index.js', {
        '../src/utils/daCtx.js': {
          default: async () => ({ authorized: false, users: [{ email: 'anonymous' }] })
        }
      }
    )

    const resp = await hnd.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 401);
  });

  it('should return 403 when logged in but not authorized', async () => {
    const hnd = await esmock(
      '../src/index.js', {
        '../src/utils/daCtx.js': {
          default: async () => ({ authorized: false, users: [{ email: 'joe@bloggs.org' }] })
        }
      }
    )

    const resp = await hnd.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 403);
  });

  it('return 404 for unknown get route', async () => {
    const resp = await handler.fetch({ method: 'GET', url: 'http://www.example.com/' }, {});
    assert.strictEqual(resp.status, 404);
  });
});
