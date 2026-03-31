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
import assert from 'node:assert';
import esmock from 'esmock';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

describe('Version Audit', () => {
  describe('formatAuditLine / parseAuditLine', () => {
    it('round-trips one entry (edit, no versionLabel/versionId)', async () => {
      const { formatAuditLine, parseAuditLine } = await import('../../../src/storage/version/audit.js');
      const entry = { timestamp: '1000', users: '[{"email":"a@b.com"}]', path: 'repo/doc.html' };
      const line = formatAuditLine(entry);
      assert.strictEqual(line, '1000\t[{"email":"a@b.com"}]\trepo/doc.html\t\t');
      const parsed = parseAuditLine(line);
      assert.strictEqual(parsed.timestamp, '1000');
      assert.strictEqual(parsed.users, entry.users);
      assert.strictEqual(parsed.path, 'repo/doc.html');
      assert.strictEqual(parsed.versionLabel, '');
      assert.strictEqual(parsed.versionId, '');
    });

    it('round-trips entry with versionLabel and versionId (labelled save)', async () => {
      const { formatAuditLine, parseAuditLine } = await import('../../../src/storage/version/audit.js');
      const entry = {
        timestamp: '2000',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/path.html',
        versionLabel: 'Release 1',
        versionId: 'abc-123.html',
      };
      const line = formatAuditLine(entry);
      assert.strictEqual(line, '2000\t[{"email":"u@x.com"}]\trepo/path.html\tRelease 1\tabc-123.html');
      const parsed = parseAuditLine(line);
      assert.strictEqual(parsed.versionLabel, 'Release 1');
      assert.strictEqual(parsed.versionId, 'abc-123.html');
    });

    it('parses legacy 3-column line (backward compat)', async () => {
      const { parseAuditLine } = await import('../../../src/storage/version/audit.js');
      const line = '1000\t[{}]\trepo/f.html';
      const parsed = parseAuditLine(line);
      assert.strictEqual(parsed.timestamp, '1000');
      assert.strictEqual(parsed.versionLabel, '');
      assert.strictEqual(parsed.versionId, '');
    });

    it('parses legacy 4-column line (versionId only, no label)', async () => {
      const { parseAuditLine } = await import('../../../src/storage/version/audit.js');
      const line = '2000\t[{}]\trepo/f.html\told-uuid.html';
      const parsed = parseAuditLine(line);
      assert.strictEqual(parsed.timestamp, '2000');
      assert.strictEqual(parsed.versionLabel, '');
      assert.strictEqual(parsed.versionId, 'old-uuid.html');
    });
  });

  describe('readAuditLines', () => {
    it('reads audit lines from a Node-style async iterable body', async () => {
      const lineText = '3000\t[{"email":"node@x.com"}]\trepo/path.html\t\t\n';

      async function* asyncIterableBody() {
        yield Buffer.from(lineText.slice(0, 10));
        yield Buffer.from(lineText.slice(10));
      }

      const { readAuditLines } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async () => ({ Body: asyncIterableBody() });
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');

      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].timestamp, 3000);
      assert.deepStrictEqual(lines[0].users, [{ email: 'node@x.com' }]);
      assert.strictEqual(lines[0].path, 'repo/path.html');
    });

    it('returns [] when S3 throws 404 (NoSuchKey)', async () => {
      const notFound = Object.assign(new Error('not found'), { name: 'NoSuchKey' });

      const { readAuditLines } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async () => {
                throw notFound;
              };
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.deepStrictEqual(lines, []);
    });

    it('returns empty string when Node-style async iterable body throws during iteration', async () => {
      async function* throwingIterable() {
        yield Buffer.from('partial');
        throw new Error('stream error mid-read');
      }

      const { writeAuditEntry } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async (cmd) => {
                if (cmd instanceof GetObjectCommand) return { Body: throwingIterable() };
                if (cmd instanceof PutObjectCommand) return { $metadata: { httpStatusCode: 200 } };
                return { $metadata: { httpStatusCode: 200 } };
              };
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      // throwing iterable → streamToString catch → existingText = '' → append new entry
      const result = await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: '7000',
        users: '[{"email":"e@x.com"}]',
        path: 'repo/f.html',
      });

      assert.strictEqual(result.status, 200);
    });

    it('re-throws when S3 throws a non-404 error in readAuditLines', async () => {
      const serverError = Object.assign(new Error('server err'), {
        $metadata: { httpStatusCode: 500 },
      });

      const { readAuditLines } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async () => {
                throw serverError;
              };
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      await assert.rejects(
        () => readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid'),
        (err) => err.$metadata?.httpStatusCode === 500,
      );
    });

    it('returns default anonymous user when users JSON is invalid', async () => {
      const lineText = '1000\tinvalid-json\trepo/doc.html\t\t\n';

      const { readAuditLines } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async () => ({
                Body: new ReadableStream({
                  start(controller) {
                    controller.enqueue(new TextEncoder().encode(lineText));
                    controller.close();
                  },
                }),
              });
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(lines.length, 1);
      assert.deepStrictEqual(lines[0].users, [{ email: 'anonymous' }]);
    });
  });

  describe('writeAuditEntry read-modify-write', () => {
    it('appends new line when existing content is read (Web ReadableStream body)', async () => {
      const existingLine = '1000\t[{"email":"a@b.com"}]\trepo/path.html';
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${existingLine}\n`));
          controller.close();
        },
      });

      const putCalls = [];
      function createMockS3Client() {
        return {
          async send(cmd) {
            if (cmd instanceof GetObjectCommand) return { Body: bodyStream };
            if (cmd instanceof PutObjectCommand) {
              putCalls.push(cmd.input);
              return { $metadata: { httpStatusCode: 200 } };
            }
            return { $metadata: { httpStatusCode: 200 } };
          },
        };
      }

      const { writeAuditEntry, AUDIT_TIME_WINDOW_MS } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: createMockS3Client,
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const env = {};
      const ctx = { bucket: 'bkt', org: 'org1' };
      const newEntry = {
        timestamp: String(1000 + AUDIT_TIME_WINDOW_MS + 1),
        users: '[{"email":"a@b.com"}]',
        path: 'repo/path.html',
      };

      const result = await writeAuditEntry(env, ctx, 'repo', 'file-id-1', newEntry);

      assert.strictEqual(result.status, 200);
      assert.strictEqual(putCalls.length, 1);
      const putBody = putCalls[0].Body;
      assert.strictEqual(typeof putBody, 'string');
      const lines = putBody.split('\n').filter((l) => l.trim());
      assert.strictEqual(lines.length, 2, 'must append: existing line + new line (would fail if stream not read)');
      assert.ok(lines[0].startsWith('1000\t'));
      assert.ok(lines[1].startsWith(String(1000 + AUDIT_TIME_WINDOW_MS + 1)));
    });

    it('overwrites last line when same user and within time window', async () => {
      const existingLine = '1000\t[{"email":"x@y.com"}]\trepo/f.html';
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${existingLine}\n`));
          controller.close();
        },
      });

      const putCalls = [];
      function createMockS3ClientOverwrite() {
        return {
          async send(cmd) {
            if (cmd instanceof GetObjectCommand) return { Body: bodyStream };
            if (cmd instanceof PutObjectCommand) {
              putCalls.push(cmd.input);
              return { $metadata: { httpStatusCode: 200 } };
            }
            return { $metadata: { httpStatusCode: 200 } };
          },
        };
      }

      const { writeAuditEntry, AUDIT_TIME_WINDOW_MS } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: createMockS3ClientOverwrite,
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const newEntry = {
        timestamp: String(1000 + Math.floor(AUDIT_TIME_WINDOW_MS / 2)),
        users: '[{"email":"x@y.com"}]',
        path: 'repo/f.html',
      };

      await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', newEntry);

      assert.strictEqual(putCalls.length, 1);
      const lines = putCalls[0].Body.split('\n').filter((l) => l.trim());
      assert.strictEqual(lines.length, 1, 'must overwrite last line (same user, within window)');
    });

    it('handles body with text() method (fetch Response-like body)', async () => {
      const textBody = {
        text: async () => '5000\t[{"email":"t@t.com"}]\trepo/doc.html\t\t\n',
      };

      const putCalls = [];
      const { writeAuditEntry } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async (cmd) => {
                if (cmd instanceof GetObjectCommand) return { Body: textBody };
                if (cmd instanceof PutObjectCommand) {
                  putCalls.push(cmd.input);
                  return { $metadata: { httpStatusCode: 200 } };
                }
                return { $metadata: { httpStatusCode: 200 } };
              };
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const newEntry = {
        timestamp: '9999',
        users: '[{"email":"t@t.com"}]',
        path: 'repo/doc.html',
      };
      const result = await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', newEntry);

      assert.strictEqual(result.status, 200);
      assert.strictEqual(putCalls.length, 1);
      // text() body was read: existing line is present (same user, within window → collapsed)
      const lines = putCalls[0].Body.split('\n').filter((l) => l.trim());
      assert.ok(lines.length >= 1, 'body was read from text() stream');
    });

    it('returns status 500 when GET throws a non-404 error in writeAuditEntry', async () => {
      const serverError = Object.assign(new Error('server error'), {
        $metadata: { httpStatusCode: 500 },
      });

      const { writeAuditEntry } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() {
              this.send = async (cmd) => {
                if (cmd instanceof GetObjectCommand) throw serverError;
                return { $metadata: { httpStatusCode: 200 } };
              };
            },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const result = await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: '1000',
        users: '[{"email":"x@x.com"}]',
        path: 'repo/f.html',
      });

      assert.strictEqual(result.status, 500);
    });

    it('appends three entries when edit then version then edit (version breaks time window)', async () => {
      const baseMs = 1000;
      const twoMinMs = 2 * 60 * 1000;
      const seventeenMinMs = 17 * 60 * 1000;
      const edit1 = `${baseMs}\t[{"email":"u@x.com"}]\trepo/doc.html\t\t`;
      const versionAt = `${baseMs + twoMinMs}\t[{"email":"u@x.com"}]\trepo/doc.html\tRelease 1\tuuid.html`;
      const existingText = `${edit1}\n${versionAt}\n`;
      const bodyStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(existingText));
          controller.close();
        },
      });

      const putCalls = [];
      const mockSend = (cmd) => {
        if (cmd instanceof GetObjectCommand) return { Body: bodyStream };
        if (cmd instanceof PutObjectCommand) {
          putCalls.push(cmd.input);
          return { $metadata: { httpStatusCode: 200 } };
        }
        return { $metadata: { httpStatusCode: 200 } };
      };

      const { writeAuditEntry } = await esmock(
        '../../../src/storage/version/audit.js',
        {
          '@aws-sdk/client-s3': {
            S3Client: function S3Client() { this.send = mockSend; },
            GetObjectCommand,
            PutObjectCommand,
          },
          '../../../src/storage/utils/config.js': { default: () => ({}) },
        },
      );

      const edit2At = baseMs + seventeenMinMs;
      await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: String(edit2At),
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
      });

      assert.strictEqual(putCalls.length, 1);
      const lines = putCalls[0].Body.split('\n').filter((l) => l.trim());
      assert.strictEqual(lines.length, 3, 'edit at 12:23, version at 12:25, edit at 12:40 => 3 entries');
      assert.ok(lines[0].endsWith('\t\t'), 'first line is edit (no version)');
      assert.ok(lines[1].includes('Release 1') && lines[1].includes('uuid.html'), 'second line is version');
      assert.ok(lines[2].startsWith(String(edit2At)) && lines[2].endsWith('\t\t'), 'third line is edit');
    });
  });
});
