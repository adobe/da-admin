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

import worker from '../../src/index.js';
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

describe('POST/PUT HTTP Requests', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  for (const method of ['POST', 'PUT']) {
    describe(method, () => {
      describe('/copy', () => {
        it('will support copying a long list of files as per expected browser interaction', async () => {
          const env = {
            DA_CONFIG: {
              get() {
                return undefined;
              }
            }
          };

          const initialContents = [];
          for (let i = 0; i < 1500; i++) {
            initialContents.push({ Key: `mydir/page${i}.html` });
          }

          s3Mock.on(CopyObjectCommand).callsFake(() => { return true });
          s3Mock
            .on(ListObjectsV2Command, { Bucket: 'wknd-content', Prefix: 'mydir/' })
            .resolves({ Contents: initialContents.splice(0, 500), NextContinuationToken: 'token1' });

          s3Mock
            .on(ListObjectsV2Command, { Bucket: 'wknd-content', Prefix: 'mydir/', ContinuationToken: 'token1' })
            .resolves({ Contents: initialContents.splice(0, 500), NextContinuationToken: 'token2' });

          s3Mock
            .on(ListObjectsV2Command, { Bucket: 'wknd-content', Prefix: 'mydir/', ContinuationToken: 'token2' })
            .resolves({ Contents: initialContents.splice(0, 500) });

          let form = new FormData();
          form.append('destination', '/mydir/newdir');
          let opts = { body: form, method };
          let req = new Request('https://admin.da.live/copy/wknd/mydir', opts);

          // First call
          let resp = await worker.fetch(req, env);
          assert.strictEqual(resp.status, 206);
          let body = await resp.json();
          let remaining = body.remaining;
          assert.strictEqual(remaining.length, 1000);

          // Second call
          form = new FormData();
          form.append('destination', '/mydir/newdir');
          form.append('remaining', JSON.stringify(remaining));
          opts = { body: form, method };
          req = new Request('https://admin.da.live/copy/wknd/mydir', opts);
          resp = await worker.fetch(req, env);
          assert.strictEqual(resp.status, 206);
          body = await resp.json();
          remaining = body.remaining;
          assert.strictEqual(remaining.length, 500);

          // Final call
          form = new FormData();
          form.append('destination', '/mydir/newdir');
          form.append('remaining', JSON.stringify(remaining));
          opts = { body: form, method };
          req = new Request('https://admin.da.live/copy/wknd/mydir', opts);
          resp = await worker.fetch(req, env);
          assert.strictEqual(resp.status, 204);

        });
      });
    });
  }
});
