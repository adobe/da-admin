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
/* eslint-disable prefer-arrow-callback, func-names */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import kill from 'tree-kill';
import config from 'dotenv';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createServer } from 'http';
import S3rver from 's3rver';

import itTests from './it-tests.js';

config.config();

const S3_PORT = 4569;
const SERVER_PORT = 8788;

const LOCAL_SERVER_URL = `http://localhost:${SERVER_PORT}`;

const IMS_LOCAL_PORT = 9999;
const IMS_LOCAL_KID = 'ims';

const IMS_STAGE = {
  ENDPOINT: process.env.IT_IMS_STAGE_ENDPOINT,
  CLIENT_ID_SUPER_USER: process.env.IT_IMS_STAGE_CLIENT_ID_SUPER_USER,
  CLIENT_SECRET_SUPER_USER: process.env.IT_IMS_STAGE_CLIENT_SECRET_SUPER_USER,
  CLIENT_ID_LIMITED_USER: process.env.IT_IMS_STAGE_CLIENT_ID_LIMITED_USER,
  CLIENT_SECRET_LIMITED_USER: process.env.IT_IMS_STAGE_CLIENT_SECRET_LIMITED_USER,
  SCOPES: process.env.IT_IMS_STAGE_SCOPES,
};

const S3_DIR = './test/it/bucket';

const IT_ORG = 'da-admin-ci-it-org';
const IT_DEFAULT_REPO = 'test-repo';

describe('Integration Tests: smoke tests', function () {
  let s3rver;
  let devServer;
  let imsServer;
  let publicKeyJwk;

  const context = {
    serverUrl: LOCAL_SERVER_URL,
    org: IT_ORG,
    repo: IT_DEFAULT_REPO,
    accessToken: '',
  };

  const cleanupWranglerState = () => {
    const wranglerState = path.join(process.cwd(), '.wrangler/state');
    if (fs.existsSync(wranglerState)) {
      fs.rmSync(wranglerState, { recursive: true });
    }
  };

  const getIMSProfile = async (accessToken) => {
    const res = await fetch(`${IMS_STAGE.ENDPOINT}/ims/profile/v1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const json = await res.json();
      return json;
    }
    throw new Error(`Failed to fetch IMS profile: ${res.status}`);
  };

  const connectToIMS = async (clientId, clientSecret) => {
    const postData = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: IMS_STAGE.SCOPES,
    };

    const form = new FormData();
    Object.entries(postData).forEach(([k, v]) => {
      form.append(k, v);
    });

    let res;
    try {
      res = await fetch(`${IMS_STAGE.ENDPOINT}/ims/token/v3`, {
        method: 'POST',
        body: form,
      });
    } catch (e) {
      throw new Error(`cannot send request to IMS: ${e.message}`);
    }

    if (res.ok) {
      const json = await res.json();
      const profile = await getIMSProfile(json.access_token);
      return {
        accessToken: json.access_token,
        email: profile.email,
        userId: profile.userId,
      };
    }
    throw new Error(`error response from IMS with status: ${res.status} and body: ${await res.text()}`);
  };

  /* eslint-disable max-len */
  const connectAsSuperUser = async () => connectToIMS(IMS_STAGE.CLIENT_ID_SUPER_USER, IMS_STAGE.CLIENT_SECRET_SUPER_USER);

  /* eslint-disable max-len */
  const connectAsLimitedUser = async () => connectToIMS(IMS_STAGE.CLIENT_ID_LIMITED_USER, IMS_STAGE.CLIENT_SECRET_LIMITED_USER);

  const localTokenCache = {};
  let IMSPrivateKey;

  const setupIMSLocalKey = async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    IMSPrivateKey = privateKey;
    publicKeyJwk = await exportJWK(publicKey);
    publicKeyJwk.use = 'sig';
    publicKeyJwk.kid = IMS_LOCAL_KID;
    publicKeyJwk.alg = 'RS256';
  };

  const getIMSLocalToken = async (userId) => {
    const email = `${userId}@example.com`;
    const accessToken = await new SignJWT({
      type: 'access_token',
      user_id: email,
      created_at: String(Date.now() - 1000),
      expires_in: '86400000',
    })
      .setProtectedHeader({ alg: 'RS256', kid: IMS_LOCAL_KID })
      .sign(IMSPrivateKey);

    localTokenCache[accessToken] = {
      accessToken,
      email,
      userId: email,
    };
    return localTokenCache[accessToken];
  };

  const setupIMSServer = async () => {
    // Start mock IMS server
    imsServer = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

      // Log requests for debugging
      console.log(`[IMS Mock] ${req.method} ${req.url}`);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
      } else if (req.url === '/ims/keys') {
        res.writeHead(200);
        res.end(JSON.stringify({ keys: [publicKeyJwk] }));
      } else if (req.url === '/ims/profile/v1') {
        const cachedToken = localTokenCache[req.headers.authorization.split(' ').pop()];
        if (!cachedToken) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({
          email: cachedToken.email,
          userId: cachedToken.userId,
        }));
      } else if (req.url === '/ims/organizations/v5') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      } else {
        console.log(`[IMS Mock] 404 Not Found: ${req.url}`);
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    await new Promise((resolve) => {
      imsServer.listen(IMS_LOCAL_PORT, '127.0.0.1', resolve);
    });
  };

  const setupS3rver = async () => {
    s3rver = new S3rver({
      port: S3_PORT,
      address: '127.0.0.1',
      directory: path.resolve(S3_DIR),
      silent: true,
    });
    await s3rver.run();
  };

  const setupDevServer = async () => {
    devServer = spawn('npx', [
      'wrangler', 'dev',
      '--port', SERVER_PORT.toString(),
      '--env', 'it',
      // '--log-level', 'debug',
    ], {
      stdio: 'pipe', // Capture output for debugging
      detached: false, // Keep in same process group for easier cleanup
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      let started = false;
      devServer.stdout.on('data', (data) => {
        const str = data.toString();
        // Always log wrangler output including errors
        // console.log('[Wrangler]', str.trim());
        if (str.includes('Ready on http://localhost') && !started) {
          started = true;
          resolve();
        }
      });

      devServer.stderr.on('data', (data) => {
        console.error('[Wrangler Err]', data.toString());
      });

      devServer.on('error', reject);
    });
  };

  before(async function () {
    // Increase timeout for server startup
    this.timeout(30000);

    if (process.env.WORKER_PREVIEW_URL) {
      if (!IMS_STAGE.ENDPOINT
        || !IMS_STAGE.CLIENT_ID_SUPER_USER
        || !IMS_STAGE.CLIENT_SECRET_SUPER_USER
        || !IMS_STAGE.CLIENT_ID_LIMITED_USER
        || !IMS_STAGE.CLIENT_SECRET_LIMITED_USER
        || !IMS_STAGE.SCOPES) {
        throw new Error('IT_IMS_STAGE_ENDPOINT, IT_IMS_STAGE_CLIENT_ID_SUPER_USER, IT_IMS_STAGE_CLIENT_SECRET_SUPER_USER, IT_IMS_STAGE_CLIENT_ID_LIMITED_USER, IT_IMS_STAGE_CLIENT_SECRET_LIMITED_USER, and IT_IMS_STAGE_SCOPES must be set');
      }
      context.local = false;
      context.serverUrl = process.env.WORKER_PREVIEW_URL;
      const branch = process.env.WORKER_PREVIEW_BRANCH;
      if (!branch) {
        throw new Error('WORKER_PREVIEW_BRANCH must be set');
      }
      context.repo += `-${branch.toLowerCase().replace(/[ /_]/g, '-')}`;
      context.superUser = await connectAsSuperUser();
      context.limitedUser = await connectAsLimitedUser();
    } else {
      context.local = true;
      await setupIMSLocalKey();
      context.superUser = await getIMSLocalToken('super-user-id');
      context.limitedUser = await getIMSLocalToken('limited-user-id');

      cleanupWranglerState();
      await setupIMSServer();
      await setupS3rver();
      await setupDevServer();
    }

    console.log('Running tests with context:', context);
  });

  after(async function () {
    if (process.env.WORKER_PREVIEW_URL) {
      return;
    }

    this.timeout(10000);
    // Cleanup - forcefully kill processes
    if (devServer && devServer.pid) {
      // Remove all listeners to prevent hanging
      devServer.stdout?.removeAllListeners();
      devServer.stderr?.removeAllListeners();
      devServer.removeAllListeners();

      // Kill entire process tree (wrangler spawns child processes)
      await new Promise((resolve) => {
        kill(devServer.pid, 'SIGTERM', (err) => {
          if (err) {
            // If SIGTERM fails, force kill
            kill(devServer.pid, 'SIGKILL', () => resolve());
          } else {
            resolve();
          }
        });

        // Fallback timeout
        setTimeout(resolve, 3000);
      });
    }
    if (s3rver) {
      await s3rver.close();
    }
    if (imsServer) {
      await new Promise((resolve) => {
        imsServer.close(resolve);
      });
    }
  });

  itTests(context);
});
