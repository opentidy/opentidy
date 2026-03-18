import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/server.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { listDossierIds, getDossier } from '../../src/workspace/state.js';
import { createDossierManager } from '../../src/workspace/dossier.js';
import { createSuggestionsManager } from '../../src/workspace/suggestions.js';
import { createGapsManager } from '../../src/workspace/gaps.js';

function createMockDeps(wsDir: string) {
  const dossierManager = createDossierManager(wsDir);
  const suggestionsManager = createSuggestionsManager(wsDir);
  const gapsManager = createGapsManager(wsDir);

  return {
    workspace: {
      listDossierIds: (dir: string) => listDossierIds(dir),
      getDossier: (dir: string, id: string) => getDossier(dir, id),
      dossierManager,
      suggestionsManager,
      gapsManager,
    },
    launcher: {
      launchSession: async () => {},
      listActiveSessions: () => [],
      sendMessage: async () => {},
    },
    hooks: { handleHook: async () => {} },
    receiver: { handleGmailWebhook: async () => ({ accepted: true }) },
    checkup: { runCheckup: async () => ({ launched: [], suggestions: 0 }) },
    notify: {},
    sse: { addClient: () => {}, removeClient: () => {}, emit: () => {} },
    workspaceDir: wsDir,
  };
}

describe('API Routes', () => {
  let wsDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-api-'));
    fs.mkdirSync(path.join(wsDir, '_suggestions'), { recursive: true });
    fs.mkdirSync(path.join(wsDir, '_gaps'), { recursive: true });
    app = createApp(createMockDeps(wsDir));
  });

  afterEach(() => {
    fs.rmSync(wsDir, { recursive: true, force: true });
  });

  // --- Health ---

  it('GET /api/health returns ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
  });

  // --- Dossiers ---

  it('GET /api/dossiers returns empty list initially', async () => {
    const res = await app.request('/api/dossiers');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('POST /api/dossier creates and GET /api/dossiers returns it', async () => {
    const createRes = await app.request('/api/dossier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test-dossier', instruction: 'Test instruction', confirm: true }),
    });
    expect(createRes.status).toBe(200);

    const listRes = await app.request('/api/dossiers');
    const dossiers = await listRes.json() as any[];
    expect(dossiers).toHaveLength(1);
    expect(dossiers[0].id).toBe('test-dossier');
  });

  it('GET /api/dossier/:id returns detail', async () => {
    // Create dossier first
    await app.request('/api/dossier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'detail-test', instruction: 'Detailed test', confirm: true }),
    });

    const res = await app.request('/api/dossier/detail-test');
    expect(res.status).toBe(200);
    const dossier = await res.json() as any;
    expect(dossier.id).toBe('detail-test');
    expect(dossier.objective).toBe('Detailed test');
  });

  it('POST /api/dossier/:id/resume returns resumed', async () => {
    const res = await app.request('/api/dossier/some-id/resume', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resumed: true });
  });

  it('POST /api/dossier/:id/instruction returns launched', async () => {
    const res = await app.request('/api/dossier/some-id/instruction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: 'Do something' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ launched: true });
  });

  // --- Suggestions ---

  it('GET /api/suggestions returns empty list', async () => {
    const res = await app.request('/api/suggestions');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('POST /api/suggestion/:slug/ignore removes the suggestion', async () => {
    // Create a suggestion file
    fs.writeFileSync(
      path.join(wsDir, '_suggestions', 'test-sugg.md'),
      '# Test Suggestion\nURGENCE: normal\nSOURCE: test\nDATE: 2026-01-01\n\n## Résumé\nTest\n\n## Pourquoi\nTest\n\n## Ce que je ferais\nTest\n',
    );
    const res = await app.request('/api/suggestion/test-sugg/ignore', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(fs.existsSync(path.join(wsDir, '_suggestions', 'test-sugg.md'))).toBe(false);
  });

  // --- Sessions ---

  it('GET /api/sessions returns empty list', async () => {
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // --- Ameliorations ---

  it('GET /api/ameliorations returns empty list', async () => {
    const res = await app.request('/api/ameliorations');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // --- Hooks ---

  it('POST /api/hooks returns ok', async () => {
    const res = await app.request('/api/hooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'test', hook_event_name: 'PostToolUse' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  // --- Webhook ---

  it('POST /api/webhook/gmail returns result', async () => {
    const res = await app.request('/api/webhook/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'test@test.com', subject: 'Test' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: true });
  });

  // --- Checkup ---

  it('POST /api/checkup returns result', async () => {
    const res = await app.request('/api/checkup', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ launched: [], suggestions: 0 });
  });

  // --- Notifications ---

  it('GET /api/notifications/recent returns empty list', async () => {
    const res = await app.request('/api/notifications/recent');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // --- SSE ---

  it('GET /api/events returns SSE stream headers', async () => {
    const res = await app.request('/api/events');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  // --- Claude process output ---

  it('GET /api/claude-processes/:id/output returns 404 when no tracker', async () => {
    const res = await app.request('/api/claude-processes/1/output');
    expect(res.status).toBe(404);
  });

  it('GET /api/claude-processes/:id/output returns output content when file exists', async () => {
    const outputDir = path.join(wsDir, '_outputs');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'test-output.txt');
    fs.writeFileSync(outputPath, 'line1\nline2\n');

    const depsWithTracker = {
      ...createMockDeps(wsDir),
      tracker: {
        list: () => [],
        getById: (id: number) => id === 42 ? { id: 42, type: 'triage' as const, startedAt: '2026-01-01', status: 'done' as const, outputPath } : undefined,
      },
    };
    const appWithTracker = createApp(depsWithTracker);
    const res = await appWithTracker.request('/api/claude-processes/42/output');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('line1\nline2\n');
  });

  it('GET /api/claude-processes/:id/output returns 404 for unknown process', async () => {
    const depsWithTracker = {
      ...createMockDeps(wsDir),
      tracker: {
        list: () => [],
        getById: () => undefined,
      },
    };
    const appWithTracker = createApp(depsWithTracker);
    const res = await appWithTracker.request('/api/claude-processes/999/output');
    expect(res.status).toBe(404);
  });

  it('GET /api/claude-processes/:id/output returns 400 for invalid id', async () => {
    const depsWithTracker = {
      ...createMockDeps(wsDir),
      tracker: {
        list: () => [],
        getById: () => undefined,
      },
    };
    const appWithTracker = createApp(depsWithTracker);
    const res = await appWithTracker.request('/api/claude-processes/abc/output');
    expect(res.status).toBe(400);
  });

  // --- 404 ---

  it('unknown route returns 404', async () => {
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
  });
});

describe('createApp without deps', () => {
  it('health check works without deps', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('routes are not mounted without deps', async () => {
    const app = createApp();
    const res = await app.request('/api/dossiers');
    expect(res.status).toBe(404);
  });
});
