// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listMcpRoute, type McpDeps } from './list.js';
import { toggleMcpRoute } from './toggle.js';
import { addMcpRoute } from './add.js';
import { removeMcpRoute } from './remove.js';

function createTestDeps(configDir: string): McpDeps {
  return {
    configPath: join(configDir, 'config.json'),
    agentConfigDir: join(configDir, 'agent'),
    mcpEnvDir: join(configDir, 'mcp'),
  };
}

function writeV2Config(configDir: string, mcp: Record<string, unknown> = {}) {
  writeFileSync(join(configDir, 'config.json'), JSON.stringify({
    version: 2,
    agentConfig: { name: 'claude', configDir: join(configDir, 'agent') },
    mcp: {
      curated: {
        gmail: { enabled: true, configured: true },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
      marketplace: {},
      ...mcp,
    },
    skills: { curated: { browser: { enabled: true } }, user: [] },
  }));
}

describe('MCP routes', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'opentidy-mcp-'));
    mkdirSync(join(configDir, 'agent'), { recursive: true });
    mkdirSync(join(configDir, 'mcp'), { recursive: true });
    writeV2Config(configDir);
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('GET /mcp lists all servers', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', listMcpRoute(deps));
    const res = await app.request('/api/mcp');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curated.gmail.enabled).toBe(true);
    expect(body.marketplace).toEqual({});
  });

  it('POST /mcp/curated/gmail/toggle disables gmail', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', toggleMcpRoute(deps));

    const res = await app.request('/api/mcp/curated/gmail/toggle', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curated.gmail.enabled).toBe(false);
  });

  it('POST /mcp/curated/:name/toggle rejects unknown name', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', toggleMcpRoute(deps));

    const res = await app.request('/api/mcp/curated/unknown/toggle', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('POST /mcp/marketplace adds a new MCP', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', addMcpRoute(deps));

    const res = await app.request('/api/mcp/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'notion',
        label: 'Notion',
        command: 'npx',
        args: ['@notionhq/notion-mcp'],
        permissions: ['mcp__notion__*'],
        source: 'custom',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marketplace.notion).toBeDefined();
    expect(body.marketplace.notion.command).toBe('npx');
  });

  it('DELETE /mcp/marketplace/:name removes it', async () => {
    writeV2Config(configDir, {
      marketplace: {
        notion: { label: 'Notion', command: 'npx', args: [], permissions: ['mcp__notion__*'], source: 'custom' },
      },
    });
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', removeMcpRoute(deps));

    const res = await app.request('/api/mcp/marketplace/notion', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marketplace.notion).toBeUndefined();
  });

  it('DELETE /mcp/marketplace/:name returns 404 for unknown', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', removeMcpRoute(deps));

    const res = await app.request('/api/mcp/marketplace/unknown', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
