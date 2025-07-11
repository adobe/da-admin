import assert from 'assert';
import unknownHandler from '../../src/handlers/unknown.js';

import { describe, it } from 'vitest';

describe('unknownHandler', () => {
  it('should return unknown response', async () => {
    const result = await unknownHandler({});
    assert.strictEqual(result.status, 501);
    assert.strictEqual(result.body.includes('Unknown method'), true);
  });
});
