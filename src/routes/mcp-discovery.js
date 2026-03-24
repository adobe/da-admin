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
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import getS3Config from '../storage/utils/config.js';
import { hasPermission } from '../utils/auth.js';

const SERVER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_MCP_JSON_SIZE = 64 * 1024; // 64 KiB

const PLATFORM_SERVER_IDS = new Set([
  'playwright',
  'catalyst_ui',
]);

/**
 * Read a single S3 object as text. Returns null on any error.
 */
async function readObject(client, bucket, key) {
  try {
    const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await resp.Body.transformToString();
  } catch {
    return null;
  }
}

/**
 * Validate a parsed mcp.json config object.
 * Returns { config, error }.
 */
function validateConfig(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { config: null, error: 'mcp.json must be a JSON object' };
  }

  if (raw.type === 'http' || raw.type === 'sse') {
    if (typeof raw.url !== 'string' || !raw.url) {
      return { config: null, error: `Remote MCP config (${raw.type}) requires a "url" string` };
    }
    const remote = { type: raw.type, url: raw.url };
    if (raw.headers && typeof raw.headers === 'object') remote.headers = raw.headers;
    return { config: remote, error: null };
  }

  if (typeof raw.command === 'string' && raw.command) {
    const stdio = { command: raw.command };
    if (Array.isArray(raw.args)) stdio.args = raw.args;
    if (raw.env && typeof raw.env === 'object') stdio.env = raw.env;
    if (typeof raw.cwd === 'string') stdio.cwd = raw.cwd;
    return { config: stdio, error: null };
  }

  return { config: null, error: 'mcp.json must specify either "command" (stdio) or "type"+"url" (remote)' };
}

/**
 * GET /mcp-discovery/{org}/{site}
 *
 * Scans `mcp-servers/` under {org}/{site}, validates each server's mcp.json,
 * writes the normalized result to `.da/discovered-mcp.json`, and returns a
 * JSON summary.
 */
export async function getMcpDiscovery({ env, daCtx }) {
  if (!hasPermission(daCtx, daCtx.key, 'read')) return { status: 403 };

  const { bucket, org, site } = daCtx;
  if (!site) return { body: JSON.stringify({ error: 'Site (repo) is required' }), status: 400 };

  const config = getS3Config(env);
  const client = new S3Client(config);

  const mcpServers = {};
  const warnings = [];
  const servers = [];

  // List directories under {org}/{site}/mcp-servers/
  const prefix = `${org}/${site}/mcp-servers/`;
  let listResp;
  try {
    listResp = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: '/',
    }));
  } catch {
    const result = {
      readAt: new Date().toISOString(),
      mcpServers,
      warnings: [{ serverId: '*', message: 'mcp-servers/ directory not found or not accessible' }],
      servers,
    };
    return { body: JSON.stringify(result), status: 200 };
  }

  const dirs = (listResp.CommonPrefixes || [])
    .map((p) => p.Prefix.replace(prefix, '').replace(/\/$/, ''))
    .filter((name) => name && !name.includes('/'));

  if (dirs.length === 0) {
    const result = {
      readAt: new Date().toISOString(),
      mcpServers,
      warnings: [{ serverId: '*', message: 'mcp-servers/ contains no subdirectories' }],
      servers,
    };
    return { body: JSON.stringify(result), status: 200 };
  }

  for (const serverId of dirs) {
    if (!SERVER_ID_RE.test(serverId)) {
      warnings.push({ serverId, message: `Invalid serverId: must match ${SERVER_ID_RE}` });
      servers.push({ id: serverId, sourcePath: `${prefix}${serverId}/mcp.json`, status: 'error' });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (PLATFORM_SERVER_IDS.has(serverId)) {
      warnings.push({ serverId, message: 'Skipped: server id reserved by platform MCP' });
      servers.push({ id: serverId, sourcePath: `${prefix}${serverId}/mcp.json`, status: 'error' });
      // eslint-disable-next-line no-continue
      continue;
    }

    const mcpJsonKey = `${org}/${site}/mcp-servers/${serverId}/mcp.json`;
    // eslint-disable-next-line no-await-in-loop
    const raw = await readObject(client, bucket, mcpJsonKey);
    if (raw === null) {
      warnings.push({ serverId, message: `Could not read mcp-servers/${serverId}/mcp.json` });
      servers.push({ id: serverId, sourcePath: mcpJsonKey, status: 'error' });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (raw.length > MAX_MCP_JSON_SIZE) {
      warnings.push({ serverId, message: 'mcp.json exceeds 64 KiB size limit' });
      servers.push({ id: serverId, sourcePath: mcpJsonKey, status: 'error' });
      // eslint-disable-next-line no-continue
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnings.push({ serverId, message: 'mcp.json is not valid JSON' });
      servers.push({ id: serverId, sourcePath: mcpJsonKey, status: 'error' });
      // eslint-disable-next-line no-continue
      continue;
    }

    const { config: validConfig, error } = validateConfig(parsed);
    if (!validConfig || error) {
      warnings.push({ serverId, message: error || 'Unknown validation error' });
      servers.push({ id: serverId, sourcePath: mcpJsonKey, status: 'error' });
      // eslint-disable-next-line no-continue
      continue;
    }

    // Default cwd for stdio to the server's directory
    if (validConfig.command && !validConfig.cwd) {
      validConfig.cwd = `mcp-servers/${serverId}`;
    }

    mcpServers[serverId] = validConfig;
    servers.push({ id: serverId, sourcePath: mcpJsonKey, status: 'ok' });
  }

  const now = new Date().toISOString();
  const result = {
    readAt: now,
    scannedAt: now,
    mcpServers,
    warnings,
    servers,
  };

  // Write cache to .da/discovered-mcp.json
  const cacheKey = `${org}/${site}/.da/discovered-mcp.json`;
  const cacheBody = JSON.stringify(result, null, 2);
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: cacheKey,
      Body: cacheBody,
      ContentType: 'application/json',
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to write MCP discovery cache:', e);
  }

  return { body: JSON.stringify(result), status: 200 };
}
