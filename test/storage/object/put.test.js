/*
* Copyright 2024 Adobe. All rights reserved.
* This file is licensed to you under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License. You may obtain a copy
* of the License at http://www.apache.org/licenses/LICENSE-2.0
  *
* Unless required by applicable law or agreed to in writing, software distributed under
* the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
* OF ANY KIND, either express or implied. See the License for the specific language
* governing permissions and limitations under the License.
*/
import assert from 'node:assert';
import { strict as esmock } from 'esmock';

import { putObjectWithVersion, postObjectVersion } from './mocks/version/put.js';
import { destroyMiniflare, getMiniflare } from '../../mocks/miniflare.js';
const putObject = await esmock('../../../src/storage/object/put.js', {
  '../../../src/storage/version/put.js': {
    putObjectWithVersion,
    postObjectVersion,
  }
});

describe('Object storage', () => {
  let mf;
  let env;
  beforeEach(async () => {
    mf = await getMiniflare();
    env = await mf.getBindings();
  });

  afterEach(async () => {
    await destroyMiniflare(mf);
  });

  describe('Put success', async () => {
    it('Successfully puts text data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx/index.html', propsKey: 'geometrixx.props' };
      const obj = { data: '<html></html>' };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
    });

    it('Successfully puts file data', async () => {
      const daCtx = { org: 'adobe', site: 'geometrixx', isFile: true, key: 'geometrixx/foo.html', pathname: '/foo', propsKey: 'geometrixx/foo.html.props' };
      const data = new File(['foo'], 'foo.txt', { type: 'text/plain' });
      const obj = { data };
      const resp = await putObject(env, daCtx, obj);
      assert.strictEqual(resp.status, 201);
      assert.strictEqual(JSON.parse(resp.body).source.editUrl, 'https://da.live/edit#/adobe/foo')
    });

    it('Successfully puts no data - org creation', async () => {
      let orgs = await env.DA_AUTH.get('orgs', { type: 'json' });
      assert.ifError(orgs);
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props' };
      const resp = await putObject(env, daCtx);
      assert.strictEqual(resp.status, 201);
      orgs = await env.DA_AUTH.get('orgs', { type: 'json' });
      assert(orgs.some((existingOrg) => existingOrg.name === 'adobe'));
    });

    it('Successfully puts no data - org exists', async () => {
      const created = new Date().toISOString();
      await env.DA_AUTH.put('orgs', JSON.stringify([{ name: 'adobe', created: created }]));
      const daCtx = { org: 'adobe', site: 'geometrixx', key: 'geometrixx', propsKey: 'geometrixx.props' };
      const resp = await putObject(env, daCtx);
      assert.strictEqual(resp.status, 201);
      const orgs = await env.DA_AUTH.get('orgs', { type: 'json' });
      assert(orgs.some((existingOrg) => existingOrg.name === 'adobe' && existingOrg.created === created));
    });
  });
});
