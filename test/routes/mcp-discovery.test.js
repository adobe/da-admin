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
/* eslint-disable max-classes-per-file */
import assert from 'node:assert';
import esmock from 'esmock';

function makeS3Mock({ listResult, getResults, putCalls }) {
  class FakeS3Client {
    // eslint-disable-next-line class-methods-use-this
    async send(command) {
      if (command.type === 'List') {
        return listResult;
      }
      if (command.type === 'Get') {
        const body = getResults[command.key];
        if (!body) {
          const err = new Error('NoSuchKey');
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return {
          Body: { transformToString: async () => body },
        };
      }
      if (command.type === 'Put') {
        putCalls.push({
          Key: command.key,
          Body: command.body,
        });
        return {};
      }
      return {};
    }
  }

  class FakeListCommand {
    constructor(input) {
      this.type = 'List';
      this.input = input;
    }
  }

  class FakeGetCommand {
    constructor(input) {
      this.type = 'Get';
      this.key = input.Key;
    }
  }

  class FakePutCommand {
    constructor(input) {
      this.type = 'Put';
      this.key = input.Key;
      this.body = input.Body;
    }
  }

  return {
    S3Client: FakeS3Client,
    ListObjectsV2Command: FakeListCommand,
    GetObjectCommand: FakeGetCommand,
    PutObjectCommand: FakePutCommand,
  };
}

describe('MCP Discovery', () => {
  const env = {};
  const baseDaCtx = {
    key: 'mysite',
    org: 'adobe',
    site: 'mysite',
    bucket: 'test-bucket',
  };
  const getS3Config = () => ({});

  it('returns 403 when permission denied', async () => {
    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '../../src/utils/auth.js': { hasPermission: () => false },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });
    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    assert.strictEqual(res.status, 403);
  });

  it('returns 400 when site is missing', async () => {
    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });
    const res = await getMcpDiscovery({ env, daCtx: { ...baseDaCtx, site: undefined } });
    assert.strictEqual(res.status, 400);
  });

  it('returns warning when mcp-servers/ not found', async () => {
    const putCalls = [];
    const s3Mock = makeS3Mock({
      listResult: { CommonPrefixes: [] },
      getResults: {},
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.body);
    assert(body.warnings.length > 0);
    assert.strictEqual(Object.keys(body.mcpServers).length, 0);
  });

  it('discovers valid stdio server', async () => {
    const putCalls = [];
    const prefix = 'adobe/mysite/mcp-servers/';
    const s3Mock = makeS3Mock({
      listResult: {
        CommonPrefixes: [{ Prefix: `${prefix}acme-tools/` }],
      },
      getResults: {
        'adobe/mysite/mcp-servers/acme-tools/mcp.json': JSON.stringify({
          command: 'node',
          args: ['./dist/server.js'],
        }),
      },
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(Object.keys(body.mcpServers).length, 1);
    assert.strictEqual(body.mcpServers['acme-tools'].command, 'node');
    assert.strictEqual(body.mcpServers['acme-tools'].cwd, 'mcp-servers/acme-tools');
    assert.strictEqual(body.servers[0].status, 'ok');
    assert.strictEqual(putCalls.length, 1);
  });

  it('discovers valid remote SSE server', async () => {
    const putCalls = [];
    const prefix = 'adobe/mysite/mcp-servers/';
    const s3Mock = makeS3Mock({
      listResult: {
        CommonPrefixes: [{ Prefix: `${prefix}remote-api/` }],
      },
      getResults: {
        'adobe/mysite/mcp-servers/remote-api/mcp.json': JSON.stringify({
          type: 'sse',
          url: 'https://example.com/mcp',
        }),
      },
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    const body = JSON.parse(res.body);
    assert.strictEqual(body.mcpServers['remote-api'].type, 'sse');
    assert.strictEqual(body.mcpServers['remote-api'].url, 'https://example.com/mcp');
  });

  it('skips reserved platform server id with warning', async () => {
    const putCalls = [];
    const prefix = 'adobe/mysite/mcp-servers/';
    const s3Mock = makeS3Mock({
      listResult: {
        CommonPrefixes: [{ Prefix: `${prefix}playwright/` }],
      },
      getResults: {},
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    const body = JSON.parse(res.body);
    assert.strictEqual(Object.keys(body.mcpServers).length, 0);
    const warning = body.warnings.find((w) => w.serverId === 'playwright');
    assert(warning);
    assert(warning.message.includes('reserved'));
  });

  it('skips folders with missing mcp.json', async () => {
    const putCalls = [];
    const prefix = 'adobe/mysite/mcp-servers/';
    const s3Mock = makeS3Mock({
      listResult: {
        CommonPrefixes: [{ Prefix: `${prefix}no-config/` }],
      },
      getResults: {},
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    const body = JSON.parse(res.body);
    assert.strictEqual(Object.keys(body.mcpServers).length, 0);
    assert.strictEqual(body.servers[0].status, 'error');
  });

  it('skips folders with invalid JSON', async () => {
    const putCalls = [];
    const prefix = 'adobe/mysite/mcp-servers/';
    const s3Mock = makeS3Mock({
      listResult: {
        CommonPrefixes: [{ Prefix: `${prefix}bad-json/` }],
      },
      getResults: {
        'adobe/mysite/mcp-servers/bad-json/mcp.json': '{ not valid json',
      },
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    const body = JSON.parse(res.body);
    assert.strictEqual(Object.keys(body.mcpServers).length, 0);
    const warning = body.warnings.find((w) => w.serverId === 'bad-json');
    assert(warning);
    assert(warning.message.includes('not valid JSON'));
  });

  it('handles multiple folders with mixed success/failure', async () => {
    const putCalls = [];
    const prefix = 'adobe/mysite/mcp-servers/';
    const s3Mock = makeS3Mock({
      listResult: {
        CommonPrefixes: [
          { Prefix: `${prefix}good-server/` },
          { Prefix: `${prefix}bad-server/` },
          { Prefix: `${prefix}playwright/` },
        ],
      },
      getResults: {
        'adobe/mysite/mcp-servers/good-server/mcp.json': JSON.stringify({
          command: 'python3',
          args: ['-m', 'my_server'],
        }),
        'adobe/mysite/mcp-servers/bad-server/mcp.json': '{}',
      },
      putCalls,
    });

    const { getMcpDiscovery } = await esmock('../../src/routes/mcp-discovery.js', {
      '@aws-sdk/client-s3': s3Mock,
      '../../src/utils/auth.js': { hasPermission: () => true },
      '../../src/storage/utils/config.js': { default: getS3Config },
    });

    const res = await getMcpDiscovery({ env, daCtx: baseDaCtx });
    const body = JSON.parse(res.body);
    assert.strictEqual(Object.keys(body.mcpServers).length, 1);
    assert(body.mcpServers['good-server']);
    assert.strictEqual(body.warnings.length, 2);
    assert.strictEqual(body.servers.filter((s) => s.status === 'ok').length, 1);
    assert.strictEqual(body.servers.filter((s) => s.status === 'error').length, 2);
  });
});
