/* eslint-env mocha */
import assert from 'assert';
import { strict as esmock } from 'esmock';

// Mocks
import reqs from './mocks/req.js';
import env from './mocks/env.js';
import auth from './mocks/auth.js';

const getDaCtx = await esmock(
  '../../src/utils/daCtx.js', { '../../src/utils/auth.js': auth },
);

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

  describe('Org context', async () => {
    let daCtx;

    before(async () => {
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

  describe('ACL context', () => {
    it('get user actions', () => {
      const patharr = [
        {path: '/da-aem-boilerplate/authtest/sub/sub/*', actions: []},
        {path: '/da-aem-boilerplate/authtest/sub/*', actions: ['read', 'write']},
        {path: '/da-aem-boilerplate/authtest/*', actions: ['read']},
        {path: '/*', actions: ['read', 'write']},
        {path: '/', actions: ['read', 'write']},
      ];

      const pathlookup = new Map();
      pathlookup.set('joe@acme.com', patharr);

      const user = {
        email: 'joe@acme.com',
        ident: 'AAAA@bbb.e',
        groups: [
          {orgName: 'org1', orgIdent: 'ABCDEFG', ident: 123456, groupName: 'grp1'},
          {orgName: 'org2', orgIdent: 'ZZZZZZZ', ident: 77777, groupName: 'grp2'},
        ],
      };

      assert.deepStrictEqual(['read', 'write'],
        [...getDaCtx.getUserActions(pathlookup, user, '/')]);
      assert.deepStrictEqual(['read'],
        [...getDaCtx.getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub')]);
      assert.deepStrictEqual(['read', 'write'],
        [...getDaCtx.getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/sub/sub')]);
      });
  });

  it('get user actions2', () => {
    const patharr = [
      {path: '/*', actions: ['read', 'write']},
      {path: '/', actions: ['read', 'write']},
      {path: '/da-aem-boilerplate/', actions: ['read']},
    ];
    const pathlookup = new Map();
    pathlookup.set('joe@acme.com', patharr);
    const patharr2 = [
      {path: '/*', actions: ['read']},
      {path: '/da-aem-boilerplate/authtest/*', actions: ['read', 'write']},
    ];
    pathlookup.set('ABCDEFG/123456', patharr2);

    const user = {
      email: 'joe@acme.com',
      ident: 'AAAA@bbb.e',
      groups: [
        {orgName: 'org1', orgIdent: 'ABCDEFG', ident: 123456, groupName: 'grp1'},
        {orgName: 'org2', orgIdent: 'ZZZZZZZ', ident: 77777, groupName: 'grp2'},
      ],
    };
    assert.deepStrictEqual(['read', 'write'],
      [...getDaCtx.getUserActions(pathlookup, user, '/')]);
    assert.deepStrictEqual(['read', 'write'],
      [...getDaCtx.getUserActions(pathlookup, user, '/foo')]);
    assert.deepStrictEqual(['read'],
      [...getDaCtx.getUserActions(pathlookup, user, '/da-aem-boilerplate/')]);
    assert.deepStrictEqual(['read', 'write'],
      [...getDaCtx.getUserActions(pathlookup, user, '/da-aem-boilerplate/authtest/blah')]);
  });
});
