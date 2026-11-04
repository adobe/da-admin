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
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PREFIX = '[hlx6:event] ';
const E2E = /^drafts\/esp-(dev|stage)(\/|$)/;

export function parseExport(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty log export');
  const rows = trimmed.startsWith('[')
    ? JSON.parse(trimmed) : trimmed.split(/\r?\n/).map((line) => JSON.parse(line));
  if (!Array.isArray(rows)) throw new Error('Expected JSON array or NDJSON rows');
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid log row');
    if (Array.isArray(row.logs)) {
      return row.logs.filter((entry) => typeof entry === 'string' && entry.startsWith(PREFIX))
        .map((entry) => JSON.parse(entry.slice(PREFIX.length)));
    }
    if (row.component === 'hlx6-migration') return [row];
    throw new Error('Expected worker rows with logs or structured hlx6 events');
  });
}

function evidence(event) {
  const keys = [
    'timestamp', 'event', 'requestId', 'attempt', 'attempts', 'status', 'outcome',
    'reason', 'step', 'key', 'method', 'url', 'targetVersionUrl',
    'payloadSha256', 'bytes', 'contentType', 'responseRequestId', 'responseRayId',
    'remoteOutcomeUnknown', 'delayMs', 'destinationEtag', 'destinationDocumentId',
    'error', 'xError', 'bodyReadError', 'recovery', 'location',
  ];
  return Object.fromEntries(keys.filter((key) => event[key] !== undefined)
    .map((key) => [key, event[key]]));
}

export function report(events, {
  org, site, start, end, includeE2E = false,
}) {
  const from = Date.parse(start);
  const until = Date.parse(end);
  if (!org || !site || !Number.isFinite(from) || !Number.isFinite(until) || from >= until) {
    throw new Error('Require org, site and a valid increasing UTC start/end window');
  }
  const operations = new Map();
  let excluded = 0;
  const scoped = events.filter((event) => {
    if (event.component !== 'hlx6-migration') return false;
    const time = Date.parse(event.timestamp);
    if (!Number.isFinite(time) || !event.operationId || !event.event) {
      throw new Error('Event is missing a timestamp, operationId or event name');
    }
    if (time < from || time >= until || event.daOrg !== org) return false;
    const paths = [event.daKey, event.source, event.destination].filter(Boolean);
    if (!paths.some((key) => key === site || key.startsWith(`${site}/`))) return false;
    if (!includeE2E && paths.some((key) => E2E.test(key.split('/').slice(1).join('/')))) {
      excluded += 1;
      return false;
    }
    return true;
  });
  for (const event of scoped) {
    let operation = operations.get(event.operationId);
    if (!operation) {
      operation = {
        operationId: event.operationId,
        operation: event.operation,
        daOrg: event.daOrg,
        daKey: event.daKey,
        source: event.source,
        destination: event.destination,
        target: event.target,
        sourceTarget: event.sourceTarget,
        destinationTarget: event.destinationTarget,
        actors: [],
        daEtag: event.daEtag,
        daDocumentId: event.daDocumentId,
        daVersionSnapshot: event.daVersionSnapshot,
        records: new Map(),
      };
      operations.set(event.operationId, operation);
    }
    for (const key of ['daEtag', 'daDocumentId', 'daVersionSnapshot']) {
      if (event[key] !== undefined) operation[key] = event[key];
    }
    operation.actors = [...new Set([...operation.actors, ...(event.actors || [])])];
    const record = evidence(event);
    const id = [
      event.event, event.requestId, event.attempt, event.step, event.key, event.reason,
    ].join('|');
    operation.records.set(id, record);
  }

  const byOperation = {};
  const statuses = {};
  const details = [];
  for (const operation of operations.values()) {
    const { records, ...context } = operation;
    const timeline = [...records.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const completed = timeline.findLast(({ event }) => event === 'operation_completed');
    const skipped = timeline.findLast(({ event }) => event === 'operation_skipped');
    const started = timeline.some(({ event }) => event === 'operation_started');
    const state = completed?.outcome || (skipped ? 'skipped' : 'incomplete');
    byOperation[operation.operation] ||= {
      observed: 0, started: 0, succeeded: 0, failed: 0, skipped: 0, incomplete: 0,
    };
    const counts = byOperation[operation.operation];
    counts.observed += Number(timeline.some(({ event }) => event === 'operation_observed'));
    counts.started += Number(started);
    counts[state] = (counts[state] || 0) + 1;
    for (const record of timeline.filter(({ event }) => event === 'request_completed')) {
      const key = `${operation.operation}:${record.status}`;
      statuses[key] = (statuses[key] || 0) + 1;
    }
    details.push({ ...context, state, timeline });
  }
  const actionable = details.filter(({ state }) => state === 'failed' || state === 'incomplete');
  const excludedReasons = details.filter(({ state }) => state === 'skipped');
  return {
    scope: {
      org, site, start, end, includeE2E,
    },
    limitations: [
      'Event timestamps define the window; export completeness and retention are not verified.',
      'Incomplete operations may cross window boundaries or reflect missing logs; remote outcome is unknown.',
      'Historical failures are not proof of current divergence; no content comparison or automatic replay is performed.',
      'Payload hashes and revision references do not recover overwritten/deleted bytes without retained source history.',
    ],
    excludedEventRows: excluded,
    byOperation,
    requestStatuses: statuses,
    distinctActionablePaths: new Set(actionable.map(({ daKey }) => daKey).filter(Boolean)).size,
    actionable,
    skipped: excludedReasons,
    operations: details,
  };
}

export async function main(args) {
  const [file, ...flags] = args;
  if (!file || flags.length % 2 !== 0) {
    throw new Error('Usage: node scripts/hlx6-report.js export.json --org ORG --site SITE --start ISO --end ISO');
  }
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i].replace(/^--/, '');
    if (!['org', 'site', 'start', 'end'].includes(key) || !flags[i].startsWith('--')) {
      throw new Error(`Unknown option ${flags[i]}`);
    }
    options[key] = flags[i + 1];
  }
  const result = report(parseExport(await readFile(file, 'utf8')), options);
  console.log(JSON.stringify(result, null, 2));
  if (result.actionable.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
