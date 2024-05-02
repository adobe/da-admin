import assert from 'assert';
import putHelper from '../../src/helpers/source.js';

import env from '../utils/mocks/env.js';
const daCtx = { org: 'cq', key: 'geometrixx/hello.html', propsKey: 'geometrixx/hello.html.props' };

const MOCK_URL = 'https://da.live/source/cq/geometrixx/hello';

describe('Source helper', () => {
  describe('Put success', async () => {
    it('Returns null if no content type', async () => {
      const req = new Request(MOCK_URL);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(helped, null);
    });

    it('Returns null if unssupported content type', async () => {
      const opts = {
        headers: new Headers({
          'Content-Type': `custom/form; boundary`,
        }),
      };

      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(helped, undefined);
    });

    it('Returns null if supported content type but no form data', async () => {
      const opts = {
        body: {},
        method: 'PUT',
        headers: new Headers({
          'Content-Type': `multipart/form-data; boundary`,
        }),
      };

      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(helped, null);
    });

    it('Returns empty object if no form data fields', async () => {
      const body = new FormData();

      const opts = {
        body,
        method: 'PUT',
        headers: new Headers({
          'Content-Type': `application/x-www-form-urlencoded; boundary`,
        }),
      };

      const req = new Request(MOCK_URL, opts);

      const helped = await putHelper(req, env, daCtx);
      assert.strictEqual(Object.keys(helped).length, 0);
    });
  });
});
