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
import assert from 'node:assert';
import S3rver from 's3rver';
import { spawn } from 'child_process';
import path from 'path';

const S3_PORT = 4569;
const SERVER_PORT = 8788;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const S3_DIR = './test/it/bucket';

describe('Integration Tests: smoke tests', function () {
  let s3rver;
  let devServer;

  before(async function () {
    // Increase timeout for server startup
    this.timeout(30000);
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
      '--env', 'it', // Use 'integration' environment from wrangler.toml
      '--var', 'S3_DEF_URL:http://localhost:4569',
      '--var', 'S3_ACCESS_KEY_ID:S3RVER',
      '--var', 'S3_SECRET_ACCESS_KEY:S3RVER',
      '--var', 'S3_FORCE_PATH_STYLE:true',
      '--var', 'IMS_ORIGIN:http://localhost:9999',
      '--var', 'AEM_ADMIN_MEDIA_API_KEY:test-key',
    ], {
      stdio: 'pipe', // Capture output for debugging
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

      // Timeout if it doesn't start
      setTimeout(() => {
        if (!started) reject(new Error('Timeout waiting for Wrangler to start'));
      }, 20000);
    });
  });

  after(async () => {
    // Cleanup
    if (devServer) {
      devServer.kill();
    }
    if (s3rver) {
      await s3rver.close();
    }
  });

  it('should get a object via HTTP request', async () => {
    const org = 'test-org';
    const key = 'test-folder/page1.html';

    const url = `${SERVER_URL}/source/${org}/${key}`;
    const resp = await fetch(url);

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.text();
    assert.strictEqual(body, '<html><body><h1>Page 1</h1></body></html>');
  });

  it('should list objects via HTTP request', async () => {
    const org = 'test-org';
    const key = 'test-folder';

    const url = `${SERVER_URL}/list/${org}/${key}`;
    const resp = await fetch(url);

    assert.strictEqual(resp.status, 200, `Expected 200 OK, got ${resp.status}`);

    const body = await resp.json();

    const fileNames = body.map((item) => item.name);
    assert.ok(fileNames.includes('page1'), 'Should list page1');
    assert.ok(fileNames.includes('page2'), 'Should list page2');
  });
});
