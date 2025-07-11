import assert from 'assert';
import { describe, it, beforeAll, afterEach, vi } from 'vitest';
import handler from '../src/index.js';
import daCtx from '../src/utils/daCtx.js';

describe('fetch', () => {
  beforeAll(() => {
    vi.mock('../src/utils/daCtx.js', () => ({
      default: vi.fn()
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should be callable', () => {
    assert(handler.fetch);
  });

  it('should return a response object for options', async () => {
    const resp = await handler.fetch({ method: 'OPTIONS' }, {});
    assert.strictEqual(resp.status, 204);
  });

  it('should return a response object for unknown', async () => {
    daCtx.mockImplementation(async () => ({ authorized: true, users: [{ email: 'test@example.com' }] }));
    
    const resp = await handler.fetch({ url: 'https://www.example.com', method: 'BLAH' }, {});
    assert.strictEqual(resp.status, 501);
  });

  it('should return 401 when not authorized and not logged in', async () => {
    daCtx.mockImplementation(async () => ({ authorized: false, users: [{ email: 'anonymous' }] }));

    const resp = await handler.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 401);
  });

  it('should return 403 when logged in but not authorized', async () => {
    daCtx.mockImplementation(async () => ({ authorized: false, users: [{ email: 'joe@bloggs.org' }] }));

    const resp = await handler.fetch({ method: 'GET' }, {});
    assert.strictEqual(resp.status, 403);
  });
});
