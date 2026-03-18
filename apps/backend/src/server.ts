import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createAuthMiddleware } from './middleware/auth.js';
import { setWaitingType } from './workspace/state.js';
import { ZodError } from 'zod';
import type { Dossier, Session, Suggestion, Amelioration, NotificationRecord, AuditEntry, SSEEvent, MemoryEntry, MemoryIndexEntry, ClaudeProcess } from '@opentidy/shared';
import { MemoryCreateSchema, MemoryUpdateSchema, MemoryPromptSchema } from '@opentidy/shared';
import { generateSlug } from './utils/slug.js';

interface SSEClient {
  write: (data: string) => void;
}

export interface AppDeps {
  workspace: {
    listDossierIds: (dir: string) => string[];
    getDossier: (dir: string, id: string) => Dossier;
    dossierManager: {
      createDossier(id: string, instruction: string, confirm?: boolean, title?: string): void;
      createDossierFromSuggestion(slug: string, instruction?: string): void;
      ignoreSuggestion(slug: string): void;
      completeDossier(id: string): void;
      saveArtifact(id: string, filename: string, buffer: Buffer): void;
    };
    suggestionsManager: { listSuggestions(): Suggestion[] };
    gapsManager: { listGaps(): Amelioration[]; markResolved(id: number): void; markIgnored(id: number): void };
  };
  launcher: {
    launchSession(id: string, event?: { source: string; content: string }): Promise<void>;
    listActiveSessions(): Session[];
    archiveSession(id: string): Promise<void>;
    terminateSession(id: string): Promise<void>;
    sendMessage(id: string, message: string): Promise<void>;
    setSessionWaitingType?(id: string, type: 'user' | 'tiers'): void;
  };
  hooks: { handleHook(body: unknown): { status: string } };
  receiver: { handleGmailWebhook(body: unknown): Promise<{ accepted: boolean; reason?: string }> };
  checkup: {
    runCheckup(): Promise<{ launched: string[]; suggestions: number }>;
    getStatus(): { lastRun: string | null; nextRun: string | null; result: string; launched: string[]; suggestions: number };
  };
  notify: { notifySuggestion(title: string, urgency: string): Promise<void> };
  sse: { emit(event: SSEEvent): void; addClient(client: SSEClient): void; removeClient(client: SSEClient): void };
  terminal?: { ensureReady: (sessionName: string) => Promise<number | undefined> };
  notificationStore?: { list(): NotificationRecord[] };
  audit?: { read(): AuditEntry[] };
  generateTitle?: (instruction: string) => Promise<string>;
  memoryManager?: {
    readIndex(): MemoryIndexEntry[];
    readFile(filename: string): MemoryEntry;
    writeFile(input: { filename: string; category: string; description: string; content: string }): void;
    archiveFile(filename: string): void;
  };
  memoryAgents?: {
    runPromptAgent(text: string): Promise<void>;
  };
  tracker?: {
    list(filter?: { type?: string; limit?: number }): ClaudeProcess[];
    getById?(id: number): ClaudeProcess | undefined;
  };
  workspaceDir: string;
  bearerToken?: string;
  version?: string;
}

export function createApp(deps?: AppDeps) {
  const app = new Hono();

  // Auth middleware — skip if no token configured
  if (deps?.bearerToken) {
    app.use('/api/*', createAuthMiddleware(deps.bearerToken));
  }

  // Global error handler — returns structured JSON errors for debuggability
  app.onError((err, c) => {
    if (err instanceof ZodError) {
      console.warn(`[server] ${c.req.method} ${c.req.path} validation failed:`, err.issues);
      return c.json({ error: 'Validation error', details: err.issues, path: c.req.path }, 400);
    }
    if (err instanceof SyntaxError) {
      console.warn(`[server] ${c.req.method} ${c.req.path} invalid JSON:`, err.message);
      return c.json({ error: 'Invalid JSON', path: c.req.path }, 400);
    }
    console.error(`[server] ${c.req.method} ${c.req.path} failed:`, err.message);
    return c.json({ error: err.message, path: c.req.path }, 500);
  });

  // Health check (always available, no auth required)
  app.get('/api/health', (c) => c.json({
    status: 'ok',
    version: deps?.version || 'dev',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  if (deps) {
    // GET /api/dossiers
    app.get('/api/dossiers', (c) => {
      const ids = deps.workspace.listDossierIds(deps.workspaceDir);
      const activeSessions = deps.launcher.listActiveSessions();
      const activeIds = new Set(activeSessions.map((s) => s.dossierId));
      const dossiers = ids.map((id: string) => {
        const d = deps.workspace.getDossier(deps.workspaceDir, id);
        return { ...d, hasActiveSession: activeIds.has(id) };
      });
      return c.json(dossiers);
    });

    // GET /api/dossier/:id
    app.get('/api/dossier/:id', (c) => {
      const id = c.req.param('id');
      const dossier = deps.workspace.getDossier(deps.workspaceDir, id);
      const activeSessions = deps.launcher.listActiveSessions();
      const hasActive = activeSessions.some((s) => s.dossierId === id);
      return c.json({ ...dossier, hasActiveSession: hasActive });
    });

    // POST /api/dossier — create dossier
    app.post('/api/dossier', async (c) => {
      const body = await c.req.json();
      const id = body.id || generateSlug(body.instruction, 30);

      // Create dossier immediately with instruction as description, launch session non-blocking
      const title = body.instruction.slice(0, 80);
      deps.workspace.dossierManager.createDossier(id, body.instruction, body.confirm, title);

      // Launch session in background — don't block the HTTP response
      deps.launcher.launchSession(id, { source: 'app', content: body.instruction }).catch(err => {
        console.error(`[server] launchSession failed for ${id}:`, err);
      });
      deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id }, timestamp: new Date().toISOString() });

      return c.json({ created: true, id });
    });

    // POST /api/dossier/:id/instruction
    app.post('/api/dossier/:id/instruction', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const activeSessions = deps.launcher.listActiveSessions();
      const hasActive = activeSessions.some((s) => s.dossierId === id);
      if (hasActive) {
        await deps.launcher.sendMessage(id, body.instruction);
      } else {
        await deps.launcher.launchSession(id, { source: 'app', content: body.instruction });
      }
      deps.sse.emit({ type: 'session:started', data: { dossierId: id }, timestamp: new Date().toISOString() });
      return c.json({ launched: true });
    });

    // POST /api/dossier/:id/complete
    app.post('/api/dossier/:id/complete', async (c) => {
      const id = c.req.param('id');
      await deps.launcher.archiveSession(id);
      deps.workspace.dossierManager.completeDossier(id);
      deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id }, timestamp: new Date().toISOString() });
      deps.sse.emit({ type: 'session:ended', data: { dossierId: id }, timestamp: new Date().toISOString() });
      return c.json({ completed: true });
    });

    // POST /api/dossier/:id/resume
    app.post('/api/dossier/:id/resume', async (c) => {
      const id = c.req.param('id');
      await deps.launcher.launchSession(id);
      deps.sse.emit({ type: 'session:started', data: { dossierId: id }, timestamp: new Date().toISOString() });
      return c.json({ resumed: true });
    });

    // POST /api/dossier/:id/waiting-type — reclassify waiting type
    app.post('/api/dossier/:id/waiting-type', async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const type = body.type;
      if (type !== 'user' && type !== 'tiers') {
        return c.json({ error: 'type must be "user" or "tiers"' }, 400);
      }
      const dossierDir = join(deps.workspaceDir, id);
      setWaitingType(dossierDir, type);
      deps.launcher.setSessionWaitingType?.(id, type);
      deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id, waitingType: type }, timestamp: new Date().toISOString() });
      return c.json({ ok: true });
    });

    // GET /api/dossier/:id/artifact/:filename — download artifact
    app.get('/api/dossier/:id/artifact/:filename', (c) => {
      const id = c.req.param('id');
      const filename = c.req.param('filename');
      // Prevent path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return c.json({ error: 'invalid filename' }, 400);
      }
      const filePath = join(deps.workspaceDir, id, 'artifacts', filename);
      if (!existsSync(filePath)) {
        return c.json({ error: 'not found' }, 404);
      }
      const buffer = readFileSync(filePath);
      const ext = filename.split('.').pop()?.toLowerCase() ?? '';
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        md: 'text/markdown',
      };
      const contentType = mimeTypes[ext] ?? 'application/octet-stream';
      const isText = contentType.startsWith('text/') || contentType === 'application/json';
      return new Response(buffer, {
        headers: {
          'Content-Type': isText ? `${contentType}; charset=utf-8` : contentType,
          'Content-Disposition': `inline; filename="${filename}"`,
        },
      });
    });

    // POST /api/dossier/:id/upload
    app.post('/api/dossier/:id/upload', async (c) => {
      const id = c.req.param('id');
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      if (!file) return c.json({ error: 'no file' }, 400);
      const buffer = Buffer.from(await file.arrayBuffer());
      deps.workspace.dossierManager.saveArtifact(id, file.name, buffer);
      deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id }, timestamp: new Date().toISOString() });
      return c.json({ uploaded: true, filename: file.name });
    });

    // GET /api/suggestions
    app.get('/api/suggestions', (c) => {
      return c.json(deps.workspace.suggestionsManager.listSuggestions());
    });

    // POST /api/suggestion/:slug/approve
    app.post('/api/suggestion/:slug/approve', async (c) => {
      const slug = c.req.param('slug');
      const body = await c.req.json().catch(() => ({}));
      // Read suggestion before creating dossier (file gets moved/deleted)
      const suggestion = deps.workspace.suggestionsManager.listSuggestions().find(s => s.slug === slug);
      const instruction = body.instruction || suggestion?.summary || suggestion?.title || 'Lis state.md et commence.';
      deps.workspace.dossierManager.createDossierFromSuggestion(slug, body.instruction);
      await deps.launcher.launchSession(slug, { source: 'suggestion', content: instruction });
      deps.sse.emit({ type: 'suggestion:created', data: { slug }, timestamp: new Date().toISOString() });
      deps.sse.emit({ type: 'dossier:updated', data: { dossierId: slug }, timestamp: new Date().toISOString() });
      return c.json({ approved: true });
    });

    // POST /api/suggestion/:slug/ignore
    app.post('/api/suggestion/:slug/ignore', (c) => {
      deps.workspace.dossierManager.ignoreSuggestion(c.req.param('slug'));
      deps.sse.emit({ type: 'suggestion:created', data: { slug: c.req.param('slug') }, timestamp: new Date().toISOString() });
      return c.json({ ignored: true });
    });

    // GET /api/sessions
    app.get('/api/sessions', (c) => {
      return c.json(deps.launcher.listActiveSessions());
    });

    // GET /api/terminal/:sessionName/port — returns ttyd port for a session
    app.get('/api/terminal/:sessionName/port', async (c) => {
      const sessionName = c.req.param('sessionName');
      const port = await deps.terminal?.ensureReady(sessionName);
      if (!port) return c.json({ error: 'no terminal' }, 404);
      return c.json({ port });
    });

    // POST /api/session/:id/stop — force stop a session
    app.post('/api/session/:id/stop', async (c) => {
      const id = c.req.param('id');
      await deps.launcher.terminateSession(id);
      deps.sse.emit({ type: 'session:ended', data: { dossierId: id }, timestamp: new Date().toISOString() });
      return c.json({ stopped: true });
    });

    // GET /api/ameliorations
    app.get('/api/ameliorations', (c) => {
      return c.json(deps.workspace.gapsManager.listGaps());
    });

    // POST /api/amelioration/:id/resolve
    app.post('/api/amelioration/:id/resolve', (c) => {
      deps.workspace.gapsManager.markResolved(parseInt(c.req.param('id'), 10));
      deps.sse.emit({ type: 'amelioration:created', data: { id: c.req.param('id') }, timestamp: new Date().toISOString() });
      return c.json({ resolved: true });
    });

    // POST /api/amelioration/:id/ignore
    app.post('/api/amelioration/:id/ignore', (c) => {
      deps.workspace.gapsManager.markIgnored(parseInt(c.req.param('id'), 10));
      deps.sse.emit({ type: 'amelioration:created', data: { id: c.req.param('id') }, timestamp: new Date().toISOString() });
      return c.json({ ignored: true });
    });

    // POST /api/hooks
    app.post('/api/hooks', async (c) => {
      const body = await c.req.json();
      await deps.hooks.handleHook(body);
      return c.json({ ok: true });
    });

    // POST /api/webhook/gmail
    app.post('/api/webhook/gmail', async (c) => {
      const body = await c.req.json();
      const result = await deps.receiver.handleGmailWebhook(body);
      return c.json(result);
    });

    // POST /api/checkup
    app.post('/api/checkup', async (c) => {
      const result = await deps.checkup.runCheckup();
      deps.sse.emit({ type: 'dossier:updated', data: { source: 'checkup' }, timestamp: new Date().toISOString() });
      return c.json(result);
    });

    // GET /api/checkup/status
    app.get('/api/checkup/status', (c) => {
      return c.json(deps.checkup.getStatus());
    });

    // GET /api/audit
    app.get('/api/audit', (c) => {
      return c.json(deps.audit?.read() ?? []);
    });

    // GET /api/notifications/recent
    app.get('/api/notifications/recent', (c) => {
      return c.json(deps.notificationStore?.list() ?? []);
    });

    // GET /api/claude-processes
    app.get('/api/claude-processes', (c) => {
      const type = c.req.query('type');
      const limit = parseInt(c.req.query('limit') ?? '100', 10);
      const processes = deps.tracker?.list({ type: type || undefined, limit }) ?? [];
      return c.json(processes);
    });

    // GET /api/claude-processes/:id/output — read raw output of a Claude process
    app.get('/api/claude-processes/:id/output', (c) => {
      const id = parseInt(c.req.param('id'), 10);
      if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
      const proc = deps.tracker?.getById?.(id);
      if (!proc?.outputPath) return c.json({ error: 'No output available' }, 404);
      if (!existsSync(proc.outputPath)) return c.json({ error: 'Output file not found' }, 404);
      const content = readFileSync(proc.outputPath, 'utf-8');
      return c.text(content);
    });

    // --- Memory routes ---

    // GET /api/memory — list all memory entries
    app.get('/api/memory', (c) => {
      const entries = deps.memoryManager?.readIndex() ?? [];
      return c.json(entries);
    });

    // POST /api/memory/prompt — natural language → create/update memory
    // Registered BEFORE /:filename routes to avoid "prompt" matching as :filename
    app.post('/api/memory/prompt', async (c) => {
      if (!deps.memoryAgents) return c.json({ error: 'memory agents not available' }, 503);
      const { text } = MemoryPromptSchema.parse(await c.req.json());
      console.log('[memory] processing prompt:', text);
      await deps.memoryAgents.runPromptAgent(text);
      return c.json({ ok: true });
    });

    // POST /api/memory — create new memory file
    app.post('/api/memory', async (c) => {
      if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
      const body = MemoryCreateSchema.parse(await c.req.json());
      // Check if file already exists — prevent silent overwrite
      try {
        deps.memoryManager.readFile(body.filename);
        return c.json({ error: 'File already exists' }, 409);
      } catch {
        // File doesn't exist, good to create
      }
      deps.memoryManager.writeFile(body);
      return c.json({ ok: true }, 201);
    });

    // GET /api/memory/:filename — read one memory file
    app.get('/api/memory/:filename', (c) => {
      if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
      const { filename } = c.req.param();
      try {
        const entry = deps.memoryManager.readFile(filename);
        return c.json(entry);
      } catch {
        return c.json({ error: 'Not found' }, 404);
      }
    });

    // PUT /api/memory/:filename — update memory file
    app.put('/api/memory/:filename', async (c) => {
      if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
      const { filename } = c.req.param();
      const body = MemoryUpdateSchema.parse(await c.req.json());
      let existing;
      try {
        existing = deps.memoryManager.readFile(filename);
      } catch {
        return c.json({ error: 'Not found' }, 404);
      }
      deps.memoryManager.writeFile({
        filename,
        category: body.category ?? existing.category,
        description: body.description ?? existing.description,
        content: body.content,
      });
      return c.json({ ok: true });
    });

    // POST /api/memory/:filename/archive — archive memory file
    app.post('/api/memory/:filename/archive', (c) => {
      if (!deps.memoryManager) return c.json({ error: 'memory not available' }, 503);
      const { filename } = c.req.param();
      try {
        deps.memoryManager.archiveFile(filename);
        return c.json({ ok: true });
      } catch {
        return c.json({ error: 'Not found' }, 404);
      }
    });

    // POST /api/reset — kill all sessions, wipe workspace, clean locks
    app.post('/api/reset', async (c) => {
      console.log('[opentidy] RESET — wiping everything');
      const { execFileSync } = await import('child_process');
      const { readdirSync, rmSync, statSync } = await import('fs');

      // 1. Kill all opentidy tmux sessions
      try {
        const raw = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf-8' });
        for (const name of raw.trim().split('\n').filter(n => n.startsWith('opentidy-'))) {
          try { execFileSync('tmux', ['kill-session', '-t', name]); } catch {}
        }
      } catch {}

      // 2. Clean workspace dossiers (keep system dirs and CLAUDE.md)
      const keep = new Set(['_suggestions', '_gaps', '_audit', '_outputs', '.claude', 'CLAUDE.md']);
      for (const entry of readdirSync(deps.workspaceDir)) {
        if (keep.has(entry)) {
          if (entry.startsWith('_')) {
            const dir = join(deps.workspaceDir, entry);
            try {
              if (statSync(dir).isDirectory()) {
                for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true });
              }
            } catch {}
          }
          continue;
        }
        rmSync(join(deps.workspaceDir, entry), { recursive: true, force: true });
      }

      // 3. Clean locks
      try {
        const lockDir = '/tmp/opentidy-locks';
        if (statSync(lockDir).isDirectory()) {
          for (const f of readdirSync(lockDir)) rmSync(join(lockDir, f), { force: true });
        }
      } catch {}

      // 4. Kill ttyd processes
      try {
        const ttydPids = execFileSync('pgrep', ['-f', 'ttyd'], { encoding: 'utf-8' }).trim();
        for (const pid of ttydPids.split('\n').filter(Boolean)) {
          try { process.kill(parseInt(pid)); } catch {}
        }
      } catch {}

      console.log('[opentidy] RESET complete — restarting in 1s');
      c.header('Content-Type', 'application/json');

      // 5. Schedule self-restart after response is sent
      setTimeout(() => {
        console.log('[opentidy] Restarting process...');
        process.exit(0); // tsx watch or launchctl will restart us
      }, 1000);

      return c.json({ reset: true });
    });

    // GET /api/test-tasks/count — how many test tasks are defined
    app.get('/api/test-tasks/count', async (c) => {
      const { TEST_TASKS } = await import('./fixtures/test-tasks.js');
      return c.json({ count: TEST_TASKS.length });
    });

    // POST /api/test-tasks — launch all test tasks
    // Creates all dossiers first (sync, fast), then launches sessions in background.
    // Title generation is skipped for test tasks — the task description is used instead.
    app.post('/api/test-tasks', async (c) => {
      const { TEST_TASKS } = await import('./fixtures/test-tasks.js');
      console.log(`[opentidy] Launching ${TEST_TASKS.length} test tasks`);
      const created: string[] = [];

      // Step 1: create all dossiers (fast, no claude -p)
      for (const task of TEST_TASKS) {
        const id = generateSlug(task.instruction, 30);
        deps.workspace.dossierManager.createDossier(id, task.instruction, task.confirm, task.description);
        created.push(id);
      }

      // Step 2: launch sessions concurrently in background
      // Each launch is independent (tmux session + Claude Code instance)
      const tasks = [...TEST_TASKS];
      for (let i = 0; i < created.length; i++) {
        const idx = i;
        const id = created[i];
        const task = tasks[i];
        // Fire-and-forget each launch with a small stagger (2s apart)
        setTimeout(async () => {
          console.log(`[test-tasks] Starting launch ${idx + 1}/${created.length}: ${id}`);
          try {
            await deps.launcher.launchSession(id, { source: 'test', content: task.instruction });
            deps.sse.emit({ type: 'dossier:updated', data: { dossierId: id }, timestamp: new Date().toISOString() });
            console.log(`[test-tasks] Launched ${idx + 1}/${created.length}: ${id}`);
          } catch (err) {
            console.error(`[test-tasks] FAILED ${idx + 1}/${created.length} ${id}:`, err);
          }
        }, idx * 2000);
      }

      return c.json({ launched: created.length, ids: created });
    });

    // GET /api/events (SSE)
    app.get('/api/events', (c) => {
      const stream = new ReadableStream({
        start(controller) {
          const client = {
            write: (data: string) => controller.enqueue(new TextEncoder().encode(data)),
          };
          deps.sse.addClient(client);
          c.req.raw.signal.addEventListener('abort', () => {
            deps.sse.removeClient(client);
          });
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    });
  }

  // Static file serving — production only (when web-dist/ exists)
  const webDistPath = resolve(import.meta.dirname, '../web-dist');
  if (existsSync(webDistPath)) {
    app.use('/*', serveStatic({ root: webDistPath }));
    // SPA fallback — serve index.html for non-API routes
    app.get('*', serveStatic({ root: webDistPath, path: 'index.html' }));
    console.log('[server] Serving static files from', webDistPath);
  }

  return app;
}

export function startServer(app: Hono, port = 5175) {
  return serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[opentidy] Backend listening on http://localhost:${info.port}`);
  });
}
