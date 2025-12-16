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
import S3rver from 's3rver';
import { spawn } from 'child_process';
import path from 'path';
import kill from 'tree-kill';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createServer } from 'http';

import itTests from './it-tests.js';

const S3_PORT = 4569;
const SERVER_PORT = 8788;

const LOCAL_SERVER_URL = `http://localhost:${SERVER_PORT}`;
const IMS_PORT = 9999;

const IMS_KID = 'ims';

const S3_DIR = './test/it/bucket';

const LOCAL_ORG = 'test-org';
const REPO = 'test-repo';

describe('Integration Tests: smoke tests', function () {
  let s3rver;
  let devServer;
  let imsServer;
  let publicKeyJwk;

  const context = {
    serverUrl: LOCAL_SERVER_URL,
    org: LOCAL_ORG,
    repo: REPO,
    accessToken: '',
  };

  const testIMSToken = async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    publicKeyJwk = await exportJWK(publicKey);
    publicKeyJwk.use = 'sig';
    publicKeyJwk.kid = IMS_KID;
    publicKeyJwk.alg = 'RS256';

    const accessToken = await new SignJWT({
      // as: 'ims-na1-stg1',
      type: 'access_token',
      user_id: 'test_user',
      created_at: String(Date.now() - 1000),
      expires_in: '86400000',
    })
      .setProtectedHeader({ alg: 'RS256', kid: IMS_KID })
      .sign(privateKey);

    return accessToken;
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
        res.writeHead(200);
        res.end(JSON.stringify({
          email: 'test@example.com',
          userId: 'test_user',
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
      imsServer.listen(IMS_PORT, '127.0.0.1', resolve);
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

    if (process.env.VERSION_PREVIEW_URL) {
      context.serverUrl = process.env.VERSION_PREVIEW_URL;
      context.org = process.env.VERSION_PREVIEW_ORG;
      // TODO solve IMS authentication for postdeploy tests
    } else {
      // local testing, start the server

      // Clear wrangler state to start fresh - needed only for local testing
      const fs = await import('fs');
      const wranglerState = path.join(process.cwd(), '.wrangler/state');
      if (fs.existsSync(wranglerState)) {
        fs.rmSync(wranglerState, { recursive: true });
      }

      context.accessToken = await testIMSToken();
      await setupIMSServer();
      await setupS3rver();
      await setupDevServer();
    }

    console.log('Running tests with context:', context);
  });

  after(async function () {
    if (process.env.VERSION_PREVIEW_URL) {
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
