// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../server.js';
import fs from 'fs';
import path from 'path';
import { listJobIds, getJob } from '../jobs/state.js';
import { createJobManager } from '../jobs/create-manager.js';
import { createSuggestionsManager } from '../suggestions/parser.js';
import { createGapsManager } from '../ameliorations/gaps.js';
import { makeDeps } from '../../shared/test-helpers/mock-deps.js';
import { useTmpDir } from '../../shared/test-helpers/tmpdir.js';

function createRealWorkspaceDeps(wsDir: string) {
  const jobManager = createJobManager(wsDir);
  const suggestionsManager = createSuggestionsManager(wsDir);
  const gapsManager = createGapsManager(wsDir);

  return makeDeps({
    workspace: {
      listJobIds: (dir: string) => listJobIds(dir),
      getJob: (dir: string, id: string) => getJob(dir, id),
      jobManager,
      suggestionsManager,
      gapsManager,
    },
    workspaceDir: wsDir,
  });
}

describe('API Routes', () => {
  const tmp = useTmpDir('opentidy-api-');
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    fs.mkdirSync(path.join(tmp.path, '_suggestions'), { recursive: true });
    fs.mkdirSync(path.join(tmp.path, '_gaps'), { recursive: true });
    app = createApp(createRealWorkspaceDeps(tmp.path));
  });

  // --- Health ---

  it('GET /api/health returns ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
  });

  // --- Jobs ---

  it('GET /api/jobs returns empty list initially', async () => {
    const res = await app.request('/api/jobs');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('POST /api/job creates and GET /api/jobs returns it', async () => {
    const createRes = await app.request('/api/job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test-job', instruction: 'Test instruction', confirm: true }),
    });
    expect(createRes.status).toBe(200);

    const listRes = await app.request('/api/jobs');
    const jobs = await listRes.json() as any[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('test-job');
  });

  it('GET /api/job/:id returns 404 for non-existent job', async () => {
    const res = await app.request('/api/job/nonexistent-id');
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Job not found');
  });

  it('GET /api/job/:id returns detail', async () => {
    // Create job first
    await app.request('/api/job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'detail-test', instruction: 'Detailed test', confirm: true }),
    });

    const res = await app.request('/api/job/detail-test');
    expect(res.status).toBe(200);
    const job = await res.json() as any;
    expect(job.id).toBe('detail-test');
    expect(job.objective).toBe('Detailed test');
  });

  it('POST /api/job/:id/resume returns resumed', async () => {
    const res = await app.request('/api/job/some-id/resume', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resumed: true });
  });

  it('POST /api/job/:id/instruction returns launched', async () => {
    const res = await app.request('/api/job/some-id/instruction', {
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
      path.join(tmp.path, '_suggestions', 'test-sugg.md'),
      '# Test Suggestion\nURGENCY: normal\nSOURCE: test\nDATE: 2026-01-01\n\n## Summary\nTest\n\n## Why\nTest\n\n## What I would do\nTest\n',
    );
    const res = await app.request('/api/suggestion/test-sugg/ignore', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(fs.existsSync(path.join(tmp.path, '_suggestions', 'test-sugg.md'))).toBe(false);
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
    const outputDir = path.join(tmp.path, '_outputs');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'test-output.txt');
    fs.writeFileSync(outputPath, 'line1\nline2\n');

    const depsWithTracker = {
      ...createRealWorkspaceDeps(tmp.path),
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
      ...createRealWorkspaceDeps(tmp.path),
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
      ...createRealWorkspaceDeps(tmp.path),
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
    const res = await app.request('/api/jobs');
    expect(res.status).toBe(404);
  });
});