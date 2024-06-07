import assert from 'assert';
import esmock from 'esmock';
import { copyFile } from '../../../src/storage/object/copy.js';

import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';

const s3Mock = mockClient(S3Client);

describe('Object copy', () => {
  it('Copies a file', async () => {
    const s3Sent = [];
    const mockS3Client = {
      send(command) {
        s3Sent.push(command);
      }
    };

    const ctx = {
      org: 'foo',
      users: [{email: "haha@foo.com"}],
    };
    const sourceKey = 'mydir/xyz.html';
    const details = {
      source: 'mydir',
      destination: 'mydir/newdir',
    };
    copyFile(mockS3Client, ctx, sourceKey, details, false);

    assert.equal(1, s3Sent.length);
    const input = s3Sent[0].input;
    assert.equal('foo-content', input.Bucket);
    assert.equal('foo-content/mydir/xyz.html', input.CopySource);
    assert.equal('mydir/newdir/xyz.html', input.Key);

    const md = input.Metadata;
    assert(md.ID, "ID should be set");
    assert(md.Version, "Version should be set");
    assert.equal('string', typeof(md.Timestamp), "Timestamp should be set as a string");
    assert.equal(md.Users, '[{"email":"haha@foo.com"}]');
    assert.equal(md.Path, 'mydir/newdir');
  });

  it('Copies a file for rename', async () => {
    const s3Sent = [];
    const mockS3Client = {
      send(command) {
        s3Sent.push(command);
      }
    };

    const ctx = { org: 'testorg' };
    const sourceKey = 'mydir/dir1/myfile.html';
    const details = {
      source: 'mydir/dir1',
      destination: 'mydir/dir2',
    };
    copyFile(mockS3Client, ctx, sourceKey, details, true);

    assert.equal(1, s3Sent.length);
    const input = s3Sent[0].input;
    assert.equal('testorg-content', input.Bucket);
    assert.equal('testorg-content/mydir/dir1/myfile.html', input.CopySource);
    assert.equal('mydir/dir2/myfile.html', input.Key);
    assert(input.Metadata === undefined, "Should not redefine metadata for rename");
  });
});
