// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listSkillsRoute, type SkillsDeps } from './list.js';
import { toggleSkillRoute } from './toggle.js';
import { addSkillRoute } from './add.js';
import { removeSkillRoute } from './remove.js';

function createTestDeps(configDir: string): SkillsDeps {
  return {
    configPath: join(configDir, 'config.json'),
    agentConfigDir: join(configDir, 'agent'),
  };
}

function writeConfig(configDir: string) {
  writeFileSync(join(configDir, 'config.json'), JSON.stringify({
    version: 2,
    agentConfig: { name: 'claude', configDir: join(configDir, 'agent') },
    mcp: {
      curated: {
        gmail: { enabled: false, configured: false },
        camoufox: { enabled: false, configured: false },
        whatsapp: { enabled: false, configured: false, wacliPath: '', mcpServerPath: '' },
      },
      marketplace: {},
    },
    skills: {
      curated: { browser: { enabled: true }, bitwarden: { enabled: false } },
      user: [{ name: 'comptable', source: '/tmp/skills/comptable', enabled: true }],
    },
  }));
}

describe('Skills routes', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'opentidy-skills-'));
    mkdirSync(join(configDir, 'agent'), { recursive: true });
    writeConfig(configDir);
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('GET /skills lists all skills', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', listSkillsRoute(deps));
    const res = await app.request('/api/skills');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curated.browser.enabled).toBe(true);
    expect(body.curated.bitwarden.enabled).toBe(false);
    expect(body.user).toHaveLength(1);
    expect(body.user[0].name).toBe('comptable');
  });

  it('POST /skills/curated/browser/toggle disables browser', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', toggleSkillRoute(deps));

    const res = await app.request('/api/skills/curated/browser/toggle', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.curated.browser.enabled).toBe(false);
  });

  it('POST /skills/curated/:name/toggle rejects unknown', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', toggleSkillRoute(deps));

    const res = await app.request('/api/skills/curated/unknown/toggle', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('POST /skills/user adds a user skill', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', addSkillRoute(deps));

    const res = await app.request('/api/skills/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'my-skill',
        source: '/home/user/.claude/skills/my-skill',
        enabled: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toHaveLength(2);
    expect(body.user[1].name).toBe('my-skill');
  });

  it('POST /skills/user rejects duplicate name', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', addSkillRoute(deps));

    const res = await app.request('/api/skills/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'comptable',
        source: '/another/path',
        enabled: true,
      }),
    });
    expect(res.status).toBe(409);
  });

  it('DELETE /skills/user/:name removes a skill', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', removeSkillRoute(deps));

    const res = await app.request('/api/skills/user/comptable', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toHaveLength(0);
  });

  it('DELETE /skills/user/:name returns 404 for unknown', async () => {
    const deps = createTestDeps(configDir);
    const app = new Hono();
    app.route('/api', removeSkillRoute(deps));

    const res = await app.request('/api/skills/user/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
