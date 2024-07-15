/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import assert from 'node:assert';
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

import copyObject from '../../../src/storage/object/copy.js';

const s3Mock = mockClient(S3Client);

describe('Object copy', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('does not allow copying to the same location', async () => {
    const details = {
      source: 'mydir',
      destination: 'mydir',
    };
    const resp = await copyObject({}, {}, details, false);
    assert.strictEqual(resp.status, 409);
  });

  it('Copies a file', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/xyz.html' }] });

    const s3Sent = [];
    s3Mock.on(CopyObjectCommand).callsFake((input => {
      s3Sent.push(input);
    }));

    const ctx = {
      org: 'foo',
      users: [{email: 'haha@foo.com'}],
    };
    const details = {
      source: 'mydir',
      destination: 'mydir/newdir',
    };
    await copyObject({}, ctx, details, false);

    assert.strictEqual(s3Sent.length, 3);
    const input = s3Sent[0];
    assert.strictEqual(input.Bucket, 'foo-content');
    assert.strictEqual(input.CopySource, 'foo-content/mydir/xyz.html');
    assert.strictEqual(input.Key, 'mydir/newdir/xyz.html');

    const md = input.Metadata;
    assert(md.ID, "ID should be set");
    assert(md.Version, "Version should be set");
    assert.strictEqual(typeof(md.Timestamp), 'string', 'Timestamp should be set as a string');
    assert.strictEqual(md.Users, '[{"email":"haha@foo.com"}]');
    assert.strictEqual(md.Path, 'mydir/newdir/xyz.html');
  });

  it('Copies a file for rename', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'mydir/dir1/myfile.html' }] });

    const s3Sent = [];
    s3Mock.on(CopyObjectCommand).callsFake((input => {
      s3Sent.push(input);
    }));

    const ctx = { org: 'testorg' };
    const details = {
      source: 'mydir/dir1',
      destination: 'mydir/dir2',
    };
    await copyObject({}, ctx, details, true);


    assert.strictEqual(s3Sent.length, 3);
    const input = s3Sent[0];
    assert.strictEqual(input.Bucket, 'testorg-content');
    assert.strictEqual(input.CopySource, 'testorg-content/mydir/dir1/myfile.html');
    assert.strictEqual(input.Key, 'mydir/dir2/myfile.html');
    assert.ifError(input.Metadata);
  });
});
