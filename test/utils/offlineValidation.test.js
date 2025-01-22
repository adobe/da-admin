/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import nock from 'nock';
import assert from 'assert';
import esmock from 'esmock';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import env from './mocks/env.js';

const fetch = async (url) => {
  if (url === `${env.IMS_ORIGIN}/ims/profile/v1`) {
    return {
      ok: true,
      status: 200,
      json: async () => {
        return {
          email: 'mocked@example.com',
        };
      },
    };
  }
  return {
    ok: false,
    status: 404,
  };
};

const { getUsers } = await esmock('../../src/utils/auth.js', { import: { fetch } });

async function generateMockKeyPair(kid) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicKeyJwk = await exportJWK(publicKey);

  publicKeyJwk.use = 'sig';
  publicKeyJwk.kid = kid;
  publicKeyJwk.alg = 'RS256';
  return {
    privateKey,
    publicKeyJwk,
  }
}

async function generateToken(kid, privateKey) {
  return new SignJWT({
    user_id: 'mocked_example_com',
    created_at: Date.now() / 1000,
    expires_in: 60,
  })
  .setProtectedHeader({ 
    alg: 'RS256',
    kid,
  })
  .sign(privateKey);
}

function mockRequest(accessToken) {
  return new Request(
    'https://da.live/api/source/cq/',
    {
      headers: new Headers({
        Authorization: `Bearer ${accessToken}`,
      }),
    },
  )
}

describe('Offline Token Validation', async () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should fetch keys from upstream if not in cache and store them', async () => {
    const kid = 'id1';
    const { privateKey, publicKeyJwk } = await generateMockKeyPair(kid);

    const scope = nock('https://ims-na1.adobelogin.com')
      .get('/ims/keys')
      .reply(200, { keys: [publicKeyJwk] });

    const accessToken = await generateToken(kid, privateKey);

    const before = Date.now();

    let cacheLookup = false;
    let cached;
    const localEnv = {
      ...env,
      DA_AUTH: {
        get: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cacheLookup = true;
          }
        },
        put: async (key, value) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cached = JSON.parse(value);
          }
        },
      }
    }

    const users = await getUsers(mockRequest(accessToken), localEnv);
    assert.deepStrictEqual(users, [{ email: 'mocked@example.com' } ]);
    assert.ok(cacheLookup, 'Should have looked up the keys in the cache');
    assert.ok(cached, 'Should have cached the keys');
    assert.ok(cached.uat >= before, 'Timestamp of keys in cache should be after the test started');
    assert.ok(cached.uat <= Date.now(), 'Timestamp of keys in cache should be before the test ended');
    assert.deepStrictEqual(cached.jwks, { keys: [publicKeyJwk]}, 'Cached keys should match the fetched keys');
    scope.done();
  });

  it('should only use keys from cache if present and not stale', async () => {
    const kid = 'id1';
    const { privateKey, publicKeyJwk } = await generateMockKeyPair(kid);

    const scope = nock('https://ims-na1.adobelogin.com')
      .get('/ims/keys')
      .reply(200, { keys: [publicKeyJwk] });

    const accessToken = await generateToken(kid, privateKey);

    let cacheLookup = false;
    let cached = false;
    const localEnv = {
      ...env,
      DA_AUTH: {
        get: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cacheLookup = true;
            return JSON.stringify({
              uat: Date.now(),
              jwks: {
                keys: [publicKeyJwk]
              }
            });
          }
        },
        put: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cached = true;
          }
        },
      }
    }

    const users = await getUsers(mockRequest(accessToken), localEnv);
    assert.deepStrictEqual(users, [{ email: 'mocked@example.com' } ]);
    assert.ok(cacheLookup, 'Should have looked up the keys in the cache');
    assert.ok(!cached, 'There should be no cache update');
    assert.ok(!scope.isDone());
  });

  it('should fetch key missing from cache if not in cooldown period', async () => {
    const kid1 = 'id1';
    const { 
      publicKeyJwk: publicKeyJwk1,
    } = await generateMockKeyPair(kid1);

    const kid2 = 'id2';
    const { 
      privateKey: privateKey2,
      publicKeyJwk: publicKeyJwk2,
    } = await generateMockKeyPair(kid2);

    const scope = nock('https://ims-na1.adobelogin.com')
      .get('/ims/keys')
      .reply(200, { keys: [publicKeyJwk1, publicKeyJwk2] });

    const accessToken = await generateToken(kid2, privateKey2);

    let cacheLookup = false;
    let cached;
    const localEnv = {
      ...env,
      DA_AUTH: {
        get: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cacheLookup = true;
            return JSON.stringify({
              uat: Date.now() - 60 * 1000,
              jwks: {
                keys: [publicKeyJwk1],
              }
            });
          }
        },
        put: async (key, value) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cached = JSON.parse(value);
          }
        },
      }
    }

    const before = Date.now();

    const users = await getUsers(mockRequest(accessToken), localEnv);
    assert.deepStrictEqual(users, [{ email: 'mocked@example.com' } ]);
    assert.ok(cacheLookup, 'Should have looked up the keys in the cache');
    assert.ok(cached, 'Should have cached the keys');
    assert.ok(cached.uat >= before, 'Timestamp of keys in cache should be after the test started');
    assert.ok(cached.uat <= Date.now(), 'Timestamp of keys in cache should be before the test ended');
    assert.deepStrictEqual(
      cached.jwks,
      { keys: [publicKeyJwk1, publicKeyJwk2] },
      'Cached keys should match the fetched keys',
    );
    scope.done();
  });

  it('should not fetch key missing if in the cooldown period and fail validation', async () => {
    const kid1 = 'id1';
    const { 
      publicKeyJwk: publicKeyJwk1,
    } = await generateMockKeyPair(kid1);

    const kid2 = 'id2';
    const { 
      privateKey: privateKey2,
      publicKeyJwk: publicKeyJwk2,
    } = await generateMockKeyPair(kid2);

    const scope = nock('https://ims-na1.adobelogin.com')
      .get('/ims/keys')
      .reply(200, { keys: [publicKeyJwk1, publicKeyJwk2] });

    const accessToken = await generateToken(kid2, privateKey2);

    let cacheLookup = false;
    let cached;
    const localEnv = {
      ...env,
      DA_AUTH: {
        get: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cacheLookup = true;
            return JSON.stringify({
              uat: Date.now() - 20 * 1000,
              jwks: {
                keys: [publicKeyJwk1],
              }
            });
          }
        },
        put: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cached = true;
          }
        },
      }
    }

    const users = await getUsers(mockRequest(accessToken), localEnv);
    assert.deepStrictEqual(users, [{ email: 'anonymous' } ]);
    assert.ok(cacheLookup, 'Should have looked up the keys in the cache');
    assert.ok(!cached, 'Should not try to store keys in cache.');
    assert.ok(!scope.isDone());
  });

  it('should refresh cache after 24h', async () => {
    const kid = 'id1';
    const { privateKey, publicKeyJwk } = await generateMockKeyPair(kid);

    const scope = nock('https://ims-na1.adobelogin.com')
      .get('/ims/keys')
      .reply(200, { keys: [publicKeyJwk] });

    const accessToken = await generateToken(kid, privateKey);

    const before = Date.now();

    let cacheLookup = false;
    let cached;
    const localEnv = {
      ...env,
      DA_AUTH: {
        get: async (key) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cacheLookup = true;
            return JSON.stringify({
              uat: Date.now() - 25 * 60 * 60 * 1000, // more than 24h ago
              jwks: {
                keys: [publicKeyJwk]
              }
            });
          }
        },
        put: async (key, value) => {
          if (key === 'https://ims-na1.adobelogin.com/ims/keys') {
            cached = JSON.parse(value);
          }
        },
      }
    }

    const users = await getUsers(mockRequest(accessToken), localEnv);
    assert.deepStrictEqual(users, [{ email: 'mocked@example.com' } ]);
    assert.ok(cacheLookup, 'Should have looked up the keys in the cache');
    assert.ok(cached, 'Should have cached the keys');
    assert.ok(cached.uat >= before, 'Timestamp of keys in cache should be after the test started');
    assert.ok(cached.uat <= Date.now(), 'Timestamp of keys in cache should be before the test ended');
    assert.deepStrictEqual(cached.jwks, { keys: [publicKeyJwk]}, 'Cached keys should match the fetched keys');
    scope.done();
  });
});
