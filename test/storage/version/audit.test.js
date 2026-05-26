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
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const AUDIT_MODULE = '../../../src/storage/version/audit.js';
const CONFIG_MODULE = '../../../src/storage/utils/config.js';

function makeStreamBody(text) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function mockAudit(sendHandler) {
  return esmock(AUDIT_MODULE, {
    '@aws-sdk/client-s3': {
      S3Client: function S3Client() { this.send = sendHandler; },
      GetObjectCommand,
      PutObjectCommand,
      ListObjectsV2Command,
    },
    [CONFIG_MODULE]: { default: () => ({}) },
  });
}

describe('Version Audit', () => {
  describe('formatAuditLine / parseAuditLine', () => {
    it('round-trips one entry (edit, no versionLabel/versionId)', async () => {
      const { formatAuditLine, parseAuditLine } = await import(AUDIT_MODULE);
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
      const { formatAuditLine, parseAuditLine } = await import(AUDIT_MODULE);
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
      const { parseAuditLine } = await import(AUDIT_MODULE);
      const parsed = parseAuditLine('1000\t[{}]\trepo/f.html');
      assert.strictEqual(parsed.timestamp, '1000');
      assert.strictEqual(parsed.versionLabel, '');
      assert.strictEqual(parsed.versionId, '');
    });

    it('parses legacy 4-column line (versionId only, no label)', async () => {
      const { parseAuditLine } = await import(AUDIT_MODULE);
      const parsed = parseAuditLine('2000\t[{}]\trepo/f.html\told-uuid.html');
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
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return { Contents: [{ Key: 'o/repo/.da-versions/fid/audit.txt' }] };
        }
        if (cmd instanceof GetObjectCommand) return { Body: asyncIterableBody() };
        return {};
      });
      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(lines[0].timestamp, 3000);
      assert.deepStrictEqual(lines[0].users, [{ email: 'node@x.com' }]);
      assert.strictEqual(lines[0].path, 'repo/path.html');
    });

    it('returns [] when S3 throws 404 (NoSuchKey)', async () => {
      const notFound = Object.assign(new Error('not found'), { name: 'NoSuchKey' });
      const { readAuditLines } = await mockAudit(async () => {
        throw notFound;
      });
      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.deepStrictEqual(lines, []);
    });

    it('skips a per-entry stream that throws during iteration (no crash)', async () => {
      const goodLine = '9000\t[{"email":"good@x.com"}]\trepo/f.html\t\t\n';
      async function* throwingIterable() {
        yield Buffer.from('partial');
        throw new Error('stream error mid-read');
      }
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: 'o/repo/.da-versions/fid/audit/8000-aaaa.txt' },
              { Key: 'o/repo/.da-versions/fid/audit/9000-bbbb.txt' },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          if (cmd.input.Key.endsWith('8000-aaaa.txt')) return { Body: throwingIterable() };
          return { Body: makeStreamBody(goodLine) };
        }
        return {};
      });
      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(lines.length, 1, 'failed-stream object must be skipped, not crash readAuditLines');
      assert.strictEqual(lines[0].timestamp, 9000);
    });

    it('re-throws when S3 throws a non-404 error', async () => {
      const serverError = Object.assign(new Error('server err'), { $metadata: { httpStatusCode: 500 } });
      const { readAuditLines } = await mockAudit(async () => {
        throw serverError;
      });
      await assert.rejects(
        () => readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid'),
        (err) => err.$metadata?.httpStatusCode === 500,
      );
    });

    it('returns default anonymous user when users JSON is invalid', async () => {
      const lineText = '1000\tinvalid-json\trepo/doc.html\t\t\n';
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return { Contents: [{ Key: 'o/repo/.da-versions/fid/audit.txt' }] };
        }
        return { Body: makeStreamBody(lineText) };
      });
      const lines = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(lines.length, 1);
      assert.deepStrictEqual(lines[0].users, [{ email: 'anonymous' }]);
    });
    it('merges legacy audit.txt, archive files, and per-entry objects (transparent migration)', async () => {
      const archiveLine = '1000\t[{"email":"a@x.com"}]\t/doc.html\t\t';
      const legacyLine = '2000\t[{"email":"b@x.com"}]\t/doc.html\t\t';
      const perEntry1 = '7000\t[{"email":"c@x.com"}]\t/doc.html\t\t';
      const perEntry2 = '9000\t[{"email":"d@x.com"}]\t/doc.html\t\t';
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: 'o/repo/.da-versions/fid/audit.txt' },
              { Key: 'o/repo/.da-versions/fid/audit-1000.txt' },
              { Key: 'o/repo/.da-versions/fid/audit/7000-aaaa.txt' },
              { Key: 'o/repo/.da-versions/fid/audit/9000-bbbb.txt' },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.endsWith('audit-1000.txt')) return { Body: makeStreamBody(`${archiveLine}\n`) };
          if (k.endsWith('audit.txt')) return { Body: makeStreamBody(`${legacyLine}\n`) };
          if (k.endsWith('7000-aaaa.txt')) return { Body: makeStreamBody(`${perEntry1}\n`) };
          if (k.endsWith('9000-bbbb.txt')) return { Body: makeStreamBody(`${perEntry2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 4, 'all four sources must merge transparently');
      assert.deepStrictEqual(out.map((l) => l.timestamp), [1000, 2000, 7000, 9000], 'must be sorted ascending');
    });

    it('skips an object that throws on GET and still returns other entries', async () => {
      const currentLine = '9000\t[{"email":"b@x.com"}]\t/doc.html\t\t';
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: 'o/repo/.da-versions/fid/audit-1000.txt' },
              { Key: 'o/repo/.da-versions/fid/audit.txt' },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          if (cmd.input.Key.includes('audit-1000')) throw new Error('S3 read error');
          return { Body: makeStreamBody(`${currentLine}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 1, 'failed GET must be skipped, not throw');
      assert.strictEqual(out[0].timestamp, 9000);
    });

    it('returns [] when no audit objects exist (empty list)', async () => {
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) return { Contents: [] };
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.deepStrictEqual(out, []);
    });

    it('follows ContinuationToken to page across more than one ListObjectsV2 result', async () => {
      const line1 = '1000\t[{"email":"a@x.com"}]\t/doc.html\t\t';
      const line2 = '2000\t[{"email":"b@x.com"}]\t/doc.html\t\t';
      let listCalls = 0;
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          listCalls += 1;
          if (cmd.input.ContinuationToken === 'tok-1') {
            return { Contents: [{ Key: 'o/repo/.da-versions/fid/audit/2000-b.txt' }], IsTruncated: false };
          }
          return {
            Contents: [{ Key: 'o/repo/.da-versions/fid/audit/1000-a.txt' }],
            IsTruncated: true,
            NextContinuationToken: 'tok-1',
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.endsWith('1000-a.txt')) return { Body: makeStreamBody(`${line1}\n`) };
          if (k.endsWith('2000-b.txt')) return { Body: makeStreamBody(`${line2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(listCalls, 2, 'must call ListObjectsV2 twice (second uses ContinuationToken)');
      assert.strictEqual(out.length, 2);
      assert.deepStrictEqual(out.map((l) => l.timestamp), [1000, 2000]);
    });
    it('collapses consecutive same-user edits within AUDIT_TIME_WINDOW_MS to the later entry', async () => {
      const { AUDIT_TIME_WINDOW_MS } = await import(AUDIT_MODULE);
      const half = Math.floor(AUDIT_TIME_WINDOW_MS / 2);
      const t1 = 1000;
      const t2 = t1 + half;
      const line1 = `${String(t1)}\t[{"email":"u@x.com"}]\t/doc.html\t\t`;
      const line2 = `${String(t2)}\t[{"email":"u@x.com"}]\t/doc.html\t\t`;
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: `o/repo/.da-versions/fid/audit/${t1}-aaaa.txt` },
              { Key: `o/repo/.da-versions/fid/audit/${t2}-bbbb.txt` },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.endsWith('-aaaa.txt')) return { Body: makeStreamBody(`${line1}\n`) };
          return { Body: makeStreamBody(`${line2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 1, 'two same-user same-window edits must collapse to one');
      assert.strictEqual(out[0].timestamp, t2, 'collapse must keep the later entry');
    });

    it('does NOT collapse when consecutive edits cross AUDIT_TIME_WINDOW_MS', async () => {
      const { AUDIT_TIME_WINDOW_MS } = await import(AUDIT_MODULE);
      const t1 = 1000;
      const t2 = t1 + AUDIT_TIME_WINDOW_MS + 1;
      const line1 = `${String(t1)}\t[{"email":"u@x.com"}]\t/doc.html\t\t`;
      const line2 = `${String(t2)}\t[{"email":"u@x.com"}]\t/doc.html\t\t`;
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: `o/repo/.da-versions/fid/audit/${t1}-aaaa.txt` },
              { Key: `o/repo/.da-versions/fid/audit/${t2}-bbbb.txt` },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.endsWith('-aaaa.txt')) return { Body: makeStreamBody(`${line1}\n`) };
          return { Body: makeStreamBody(`${line2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 2, 'edits outside the window must NOT collapse');
      assert.deepStrictEqual(out.map((l) => l.timestamp), [t1, t2]);
    });

    it('does NOT collapse across different users', async () => {
      const t1 = 1000;
      const t2 = 2000;
      const line1 = `${String(t1)}\t[{"email":"a@x.com"}]\t/doc.html\t\t`;
      const line2 = `${String(t2)}\t[{"email":"b@x.com"}]\t/doc.html\t\t`;
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: `o/repo/.da-versions/fid/audit/${t1}-a.txt` },
              { Key: `o/repo/.da-versions/fid/audit/${t2}-b.txt` },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.endsWith('-a.txt')) return { Body: makeStreamBody(`${line1}\n`) };
          return { Body: makeStreamBody(`${line2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 2, 'different users must NOT collapse');
      assert.deepStrictEqual(out.map((l) => l.users[0].email), ['a@x.com', 'b@x.com']);
    });
    it('version entry breaks the collapse window (edit, version, edit produces 3 entries)', async () => {
      const t1 = 1000;
      const t2 = 2000;
      const t3 = 3000;
      const edit1 = `${String(t1)}\t[{"email":"u@x.com"}]\t/doc.html\t\t`;
      const ver = `${String(t2)}\t[{"email":"u@x.com"}]\t/doc.html\tRelease 1\tuuid.html`;
      const edit2 = `${String(t3)}\t[{"email":"u@x.com"}]\t/doc.html\t\t`;
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: `o/repo/.da-versions/fid/audit/${t1}-a.txt` },
              { Key: `o/repo/.da-versions/fid/audit/${t2}-b.txt` },
              { Key: `o/repo/.da-versions/fid/audit/${t3}-c.txt` },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.includes(String(t1))) return { Body: makeStreamBody(`${edit1}\n`) };
          if (k.includes(String(t2))) return { Body: makeStreamBody(`${ver}\n`) };
          return { Body: makeStreamBody(`${edit2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 3, 'version entry must break the collapse window');
      assert.deepStrictEqual(out.map((l) => l.timestamp), [t1, t2, t3]);
      assert.strictEqual(out[1].versionLabel, 'Release 1');
      assert.strictEqual(out[1].versionId, 'uuid.html');
    });

    it('treats malformed users JSON as opaque string (collapse falls back to raw comparison)', async () => {
      const t1 = 1000;
      const t2 = 2000;
      const line1 = `${String(t1)}\tnot-valid-json\t/doc.html\t\t`;
      const line2 = `${String(t2)}\tnot-valid-json\t/doc.html\t\t`;
      const { readAuditLines } = await mockAudit(async (cmd) => {
        if (cmd instanceof ListObjectsV2Command) {
          return {
            Contents: [
              { Key: `o/repo/.da-versions/fid/audit/${t1}-a.txt` },
              { Key: `o/repo/.da-versions/fid/audit/${t2}-b.txt` },
            ],
          };
        }
        if (cmd instanceof GetObjectCommand) {
          const k = cmd.input.Key;
          if (k.endsWith('-a.txt')) return { Body: makeStreamBody(`${line1}\n`) };
          return { Body: makeStreamBody(`${line2}\n`) };
        }
        return {};
      });
      const out = await readAuditLines({}, { bucket: 'b', org: 'o' }, 'repo', 'fid');
      assert.strictEqual(out.length, 1, 'identical malformed-JSON users normalize to the same raw string and collapse');
      assert.strictEqual(out[0].timestamp, t2);
    });
  });
  describe('writeAuditEntry (append-only ledger)', () => {
    it('writes a single unconditional PUT to a fresh per-entry key (no GET, no If-Match, no retry)', async () => {
      const calls = [];
      const { writeAuditEntry } = await mockAudit(async (cmd) => {
        if (cmd instanceof GetObjectCommand) {
          throw new Error('writeAuditEntry must not GET on the append-only path');
        }
        if (cmd instanceof PutObjectCommand) {
          calls.push(cmd.input);
          return { $metadata: { httpStatusCode: 200 } };
        }
        return { $metadata: { httpStatusCode: 200 } };
      });
      const result = await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: '5000',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
      });
      assert.strictEqual(result.status, 200);
      assert.strictEqual(calls.length, 1, 'exactly one PUT');
      assert.strictEqual(calls[0].IfMatch, undefined, 'append-only PUT must not send If-Match');
      assert.match(calls[0].Key, /^o\/repo\/\.da-versions\/fid\/audit\/5000-[a-f0-9]{16}\.txt$/);
      const lns = calls[0].Body.split('\n').filter((l) => l.trim());
      assert.strictEqual(lns.length, 1, 'body is exactly one formatted entry line');
      assert.ok(lns[0].startsWith('5000\t'));
      assert.ok(lns[0].includes('repo/doc.html'));
    });

    it('does NOT retry on 412 from PUT (append-only: no etag, no contention)', async () => {
      let putCalls = 0;
      const { writeAuditEntry } = await mockAudit(async (cmd) => {
        if (cmd instanceof PutObjectCommand) {
          putCalls += 1;
          const err = new Error('precondition failed');
          err.$metadata = { httpStatusCode: 412 };
          throw err;
        }
        return { $metadata: { httpStatusCode: 200 } };
      });
      const result = await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: '5000',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
      });
      assert.strictEqual(result.status, 500, '412 must surface as 500 immediately with no retry');
      assert.strictEqual(putCalls, 1, 'append-only path attempts PUT exactly once');
    });

    it('returns 500 with error message when PUT throws', async () => {
      const { writeAuditEntry } = await mockAudit(async (cmd) => {
        if (cmd instanceof PutObjectCommand) {
          throw new Error('network down');
        }
        return { $metadata: { httpStatusCode: 200 } };
      });
      const result = await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: '5000',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
      });
      assert.strictEqual(result.status, 500);
      assert.strictEqual(result.error, 'network down');
    });
    it('uses Date.now() as fallback when entry.timestamp is not numeric', async () => {
      const calls = [];
      const { writeAuditEntry } = await mockAudit(async (cmd) => {
        if (cmd instanceof PutObjectCommand) {
          calls.push(cmd.input);
          return { $metadata: { httpStatusCode: 200 } };
        }
        return { $metadata: { httpStatusCode: 200 } };
      });
      const before = Date.now();
      await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: 'not-a-number',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
      });
      const after = Date.now();
      const m = calls[0].Key.match(/audit\/(\d+)-[a-f0-9]{16}\.txt$/);
      assert.ok(m, 'key embeds numeric timestamp');
      const ts = parseInt(m[1], 10);
      assert.ok(ts >= before && ts <= after, 'timestamp falls back to Date.now() when entry value is non-numeric');
      const lineTs = calls[0].Body.split('\t')[0];
      assert.strictEqual(lineTs, String(ts), 'serialized entry timestamp matches key timestamp');
    });

    it('generates a fresh random suffix per call (two concurrent writes do not collide on key)', async () => {
      const calls = [];
      const { writeAuditEntry } = await mockAudit(async (cmd) => {
        if (cmd instanceof PutObjectCommand) {
          calls.push(cmd.input);
          return { $metadata: { httpStatusCode: 200 } };
        }
        return { $metadata: { httpStatusCode: 200 } };
      });
      const entry = {
        timestamp: '5000',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
      };
      await Promise.all([
        writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', entry),
        writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', entry),
      ]);
      assert.strictEqual(calls.length, 2);
      assert.notStrictEqual(calls[0].Key, calls[1].Key, 'concurrent writes must produce distinct keys');
    });

    it('writes version entry (versionLabel + versionId) to its own per-entry object', async () => {
      const calls = [];
      const { writeAuditEntry } = await mockAudit(async (cmd) => {
        if (cmd instanceof PutObjectCommand) {
          calls.push(cmd.input);
          return { $metadata: { httpStatusCode: 200 } };
        }
        return { $metadata: { httpStatusCode: 200 } };
      });
      await writeAuditEntry({}, { bucket: 'b', org: 'o' }, 'repo', 'fid', {
        timestamp: '5000',
        users: '[{"email":"u@x.com"}]',
        path: 'repo/doc.html',
        versionLabel: 'Release 1',
        versionId: 'uuid',
      });
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].Body.includes('Release 1'));
      assert.ok(calls[0].Body.includes('uuid'));
    });
  });
});
