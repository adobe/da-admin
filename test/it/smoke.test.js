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

import itTests from './it-tests.js';

const S3_PORT = 4569;
const SERVER_PORT = 8788;
const LOCAL_SERVER_URL = `http://localhost:${SERVER_PORT}`;
const S3_DIR = './test/it/bucket';

const LOCAL_ORG = 'test-org';
const REPO = 'test-repo';

describe('Integration Tests: smoke tests', function () {
  let s3rver;
  let devServer;

  const context = {
    SERVER_URL: LOCAL_SERVER_URL,
    ORG: LOCAL_ORG,
    REPO,
  };

  before(async function () {
    // Increase timeout for server startup
    this.timeout(30000);

    if (process.env.VERSION_PREVIEW_URL) {
      context.SERVER_URL = process.env.VERSION_PREVIEW_URL;
      context.ORG = process.env.VERSION_PREVIEW_ORG;
    } else {
      // local testing, start the server

      // Clear wrangler state to start fresh - needed only for local testing
      const fs = await import('fs');
      const wranglerState = path.join(process.cwd(), '.wrangler/state');
      if (fs.existsSync(wranglerState)) {
        fs.rmSync(wranglerState, { recursive: true });
      }

      s3rver = new S3rver({
        port: S3_PORT,
        address: '127.0.0.1',
        directory: path.resolve(S3_DIR),
        silent: true,
      });
      await s3rver.run();

      devServer = spawn('npx', [
        'wrangler', 'dev',
        '--port', SERVER_PORT.toString(),
        '--env', 'it',
        '--var', 'S3_DEF_URL:http://localhost:4569',
        '--var', 'S3_ACCESS_KEY_ID:S3RVER',
        '--var', 'S3_SECRET_ACCESS_KEY:S3RVER',
        '--var', 'S3_FORCE_PATH_STYLE:true',
        '--var', 'IMS_ORIGIN:http://localhost:9999',
        '--var', 'AEM_ADMIN_MEDIA_API_KEY:test-key',
      ], {
        stdio: 'pipe', // Capture output for debugging
        detached: false, // Keep in same process group for easier cleanup
      });

      // Wait for server to be ready
      await new Promise((resolve, reject) => {
        let started = false;
        devServer.stdout.on('data', (data) => {
          const str = data.toString();
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
    }

    console.log('CONTEXT', context);
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
  });

  itTests(context);
});
