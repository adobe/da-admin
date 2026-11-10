/*
 * Copyright 2026 Adobe. All rights reserved.
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
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseExport, report } from '../../scripts/hlx6-report.js';

const options = {
  org: 'adobecom',
  site: 'da-events',
  start: '2026-10-19T00:00:00Z',
  end: '2026-11-02T00:00:00Z',
};
const makeEvent = (fields = {}) => ({
  component: 'hlx6-migration',
  timestamp: '2026-10-20T12:00:00Z',
  operationId: 'operation',
  operation: 'PUT',
  daOrg: 'adobecom',
  daKey: 'da-events/a.html',
  event: 'operation_observed',
  ...fields,
});

describe('hlx6 exported-log report', () => {
  it('returns distinct CLI exit codes for clean, actionable and invalid exports', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hlx6-report-'));
    const run = (name, content) => {
      const file = join(dir, name);
      writeFileSync(file, content);
      return spawnSync(process.execPath, [
        'scripts/hlx6-report.js', file,
        '--org', options.org, '--site', options.site,
        '--start', options.start, '--end', options.end,
      ], { encoding: 'utf8' });
    };
    try {
      const clean = run('clean.json', JSON.stringify([
        makeEvent({ event: 'operation_completed', outcome: 'succeeded' }),
      ]));
      assert.strictEqual(clean.status, 0, clean.stderr);
      assert.strictEqual(JSON.parse(clean.stdout).actionable.length, 0);
      const failed = run('failed.json', JSON.stringify([
        makeEvent({ event: 'operation_completed', outcome: 'failed' }),
      ]));
      assert.strictEqual(failed.status, 2, failed.stderr);
      assert.strictEqual(JSON.parse(failed.stdout).actionable.length, 1);
      const invalid = run('invalid.json', '{broken');
      assert.strictEqual(invalid.status, 1);
      assert(invalid.stderr.length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts worker JSON arrays and structured NDJSON without parsing debug messages', () => {
    const event = makeEvent();
    assert.deepStrictEqual(parseExport(JSON.stringify([{
      logs: ['debug message', `[hlx6:event] ${JSON.stringify(event)}`],
    }])), [event]);
    assert.strictEqual(parseExport(`${JSON.stringify(event)}\n${JSON.stringify(event)}`).length, 2);
    assert.throws(() => parseExport(''), /Empty/);
    assert.throws(() => parseExport('{"unexpected":true}'), /Expected worker/);
    assert.throws(() => parseExport('[{"logs":["[hlx6:event] broken"]}]'));
  });

  it('deduplicates operation and request events and preserves actor/revision evidence', () => {
    const events = [
      makeEvent({ actors: ['editor@example.com'], daEtag: 'rev', daVersionSnapshot: { key: 'snapshot' } }),
      makeEvent({ event: 'operation_started' }),
      makeEvent({
        event: 'request_completed', requestId: 'req', status: 403, responseBody: 'do not include',
      }),
      makeEvent({ event: 'operation_completed', outcome: 'failed' }),
    ];
    const result = report([...events, ...events], options);
    assert.strictEqual(result.byOperation.PUT.failed, 1);
    assert.strictEqual(result.requestStatuses['PUT:403'], 1);
    assert.strictEqual(result.distinctActionablePaths, 1);
    assert.deepStrictEqual(result.actionable[0].actors, ['editor@example.com']);
    assert.deepStrictEqual(result.actionable[0].daVersionSnapshot, { key: 'snapshot' });
    assert(!JSON.stringify(result).includes('do not include'));
  });

  it('retains safe diagnostic and recovery evidence', () => {
    const result = report([
      makeEvent({
        event: 'request_failed',
        requestId: 'req',
        error: 'connection reset',
        xError: '[admin] failed',
        bodyReadError: 'aborted',
      }),
      makeEvent({
        event: 'propagation_failed',
        location: 'https://other.example/version',
        recovery: 'do not blindly recreate it',
        targetEtag: '"verified-target-revision"',
        responseBody: 'document body',
      }),
      makeEvent({ event: 'operation_completed', outcome: 'failed' }),
    ], options);
    const [failure, location] = result.actionable[0].timeline;
    assert.strictEqual(failure.error, 'connection reset');
    assert.strictEqual(failure.xError, '[admin] failed');
    assert.strictEqual(failure.bodyReadError, 'aborted');
    assert.strictEqual(location.location, 'https://other.example/version');
    assert.strictEqual(location.recovery, 'do not blindly recreate it');
    assert.strictEqual(location.targetEtag, '"verified-target-revision"');
    assert(!JSON.stringify(result).includes('document body'));
  });

  it('excludes either E2E endpoint of COPY/MOVE with exact folder boundaries', () => {
    const events = [
      makeEvent({ operationId: '1', daKey: 'da-events/drafts/esp-dev/a.html' }),
      makeEvent({ operationId: '2', operation: 'MOVE', source: 'da-events/drafts/esp-stage/a.html' }),
      makeEvent({ operationId: '3', operation: 'COPY', destination: 'other/drafts/esp-stage/a.html' }),
      makeEvent({ operationId: '4', daKey: 'da-events/drafts/esp-dev-other/a.html' }),
    ];
    assert.strictEqual(report(events, options).operations.length, 1);
    assert.strictEqual(report(events, { ...options, includeE2E: true }).operations.length, 4);
  });

  it('reports incomplete work and partial checkpoints without claiming lost work or content parity', () => {
    const result = report([
      makeEvent({ operation: 'MOVE' }),
      makeEvent({ operation: 'MOVE', event: 'operation_started' }),
      makeEvent({ operation: 'MOVE', event: 'operation_checkpoint', step: 'copy_completed' }),
    ], options);
    assert.strictEqual(result.actionable[0].state, 'incomplete');
    assert.strictEqual(result.actionable[0].timeline.at(-1).step, 'copy_completed');
    assert(result.limitations.some((text) => text.includes('remote outcome is unknown')));
  });

  it('distinguishes successful operations, failed attempts, and skips', () => {
    const result = report([
      makeEvent({ event: 'request_completed', requestId: '1', status: 429 }),
      makeEvent({ event: 'request_completed', requestId: '2', status: 201 }),
      makeEvent({ event: 'operation_completed', outcome: 'succeeded' }),
      makeEvent({ operationId: 'skip', event: 'operation_skipped', reason: 'partial_move' }),
    ], options);
    assert.strictEqual(result.actionable.length, 0);
    assert.strictEqual(result.byOperation.PUT.succeeded, 1);
    assert.strictEqual(result.byOperation.PUT.skipped, 1);
    assert.strictEqual(result.requestStatuses['PUT:429'], 1);
    assert.strictEqual(result.skipped[0].timeline[0].reason, 'partial_move');
  });

  it('applies half-open time bounds and site/org scope and rejects invalid input', () => {
    const result = report([
      makeEvent({ timestamp: options.end }),
      makeEvent({ daOrg: 'other' }),
      makeEvent({ daKey: 'other/a.html' }),
      makeEvent({ timestamp: options.start }),
    ], options);
    assert.strictEqual(result.operations.length, 1);
    assert.throws(() => report([makeEvent({ timestamp: 'bad' })], options), /missing/);
    assert.throws(() => report([], { ...options, start: options.end }), /valid increasing/);
  });
});
