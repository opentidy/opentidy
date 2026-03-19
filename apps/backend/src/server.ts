// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { createAuthMiddleware } from './shared/auth.js';
import { ZodError } from 'zod';
import type { Dossier, Session, Suggestion, Amelioration, NotificationRecord, AuditEntry, SSEEvent, MemoryEntry, MemoryIndexEntry, ClaudeProcess } from '@opentidy/shared';
// Dossier routes
import { listDossiersRoute } from './features/dossiers/list.js';
import { getDossierRoute } from './features/dossiers/get.js';
import { createDossierRoute } from './features/dossiers/create.js';
import { instructDossierRoute } from './features/dossiers/instruct.js';
import { completeDossierRoute } from './features/dossiers/complete.js';
import { resumeDossierRoute } from './features/dossiers/resume.js';
import { waitingTypeDossierRoute } from './features/dossiers/waiting-type.js';
import { uploadDossierRoute } from './features/dossiers/upload.js';
import { downloadDossierRoute } from './features/dossiers/download.js';
// Session routes
import { listSessionsRoute } from './features/sessions/list.js';
import { stopSessionRoute } from './features/sessions/stop.js';
// Memory routes
import { listMemoryRoute } from './features/memory/list.js';
import { createMemoryRoute } from './features/memory/create.js';
import { readMemoryRoute } from './features/memory/read.js';
import { updateMemoryRoute } from './features/memory/update.js';
import { archiveMemoryRoute } from './features/memory/archive.js';
import { promptMemoryRoute } from './features/memory/prompt.js';
// Suggestion routes
import { listSuggestionsRoute } from './features/suggestions/list.js';
import { approveSuggestionRoute } from './features/suggestions/approve.js';
import { dismissSuggestionRoute } from './features/suggestions/dismiss.js';
// Amelioration routes
import { listAmeliorationsRoute } from './features/ameliorations/list.js';
import { resolveAmeliorationRoute } from './features/ameliorations/resolve.js';
import { ignoreAmeliorationRoute } from './features/ameliorations/ignore.js';
// Hooks + Triage routes
import { hookRoute } from './features/hooks/handler.js';
import { webhookGmailRoute } from './features/triage/webhook-route.js';
// System routes
import { healthRoute } from './features/system/health.js';
import { resetRoute } from './features/system/reset.js';
import { processesRoute } from './features/system/processes.js';
import { eventsRoute } from './features/system/events.js';
import { testTasksRoute } from './features/system/test-tasks-route.js';
// Terminal routes
import { terminalPortRoute } from './features/terminal/port.js';
// Notification routes
import { notificationsRecentRoute } from './features/notifications/list.js';
// Checkup routes
import { checkupTriggerRoute } from './features/checkup/trigger.js';
// Scheduler routes
import { schedulerRoutes, type SchedulerRouteDeps } from './features/scheduler/routes.js';
import type { Scheduler } from './features/scheduler/scheduler.js';
// MCP routes
import { listMcpRoute, type McpDeps } from './features/mcp/list.js';
import { toggleMcpRoute } from './features/mcp/toggle.js';
import { addMcpRoute } from './features/mcp/add.js';
import { removeMcpRoute } from './features/mcp/remove.js';
import { registrySearchRoute } from './features/mcp/registry.js';
import { setupWizardRoute } from './features/mcp/setup-wizard.js';
import { agentsRoute } from './features/mcp/agents.js';
// Skills routes
import { listSkillsRoute, type SkillsDeps } from './features/skills/list.js';
import { toggleSkillRoute } from './features/skills/toggle.js';
import { addSkillRoute } from './features/skills/add.js';
import { removeSkillRoute } from './features/skills/remove.js';
// Setup routes
import { setupStatusRoute, type SetupDeps } from './features/setup/status.js';
import { setupUserInfoRoute, type UserInfoDeps } from './features/setup/user-info.js';
import { setupCompleteRoute } from './features/setup/complete.js';
import { setupPermissionsRoute, defaultCheckPermission, type PermissionsDeps } from './features/setup/permissions.js';
import { setupAgentsRoute, type AgentSetupDeps } from './features/setup/agents.js';

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
  scheduler?: Scheduler;
  mcpServer?: { handleRequest(request: Request): Promise<Response> };
  mcpConfig?: McpDeps;
  skillsConfig?: SkillsDeps;
  setupDeps?: SetupDeps;
  agentSetupDeps?: AgentSetupDeps;
  configFns?: {
    loadConfig: () => any;
    saveConfig: (config: any) => void;
  };
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

  // MCP endpoint (no auth — localhost only, not exposed via tunnel)
  if (deps?.mcpServer) {
    const mcpHandler = deps.mcpServer;
    app.all('/mcp', async (c) => {
      const response = await mcpHandler.handleRequest(c.req.raw);
      return response;
    });
  }

  // Health check (always available, no auth required)
  app.get('/api/health', (c) => c.json({
    status: 'ok',
    version: deps?.version || 'dev',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  if (deps) {
    // Mount route modules under /api prefix
    app.route('/api', listDossiersRoute(deps));
    app.route('/api', getDossierRoute(deps));
    app.route('/api', createDossierRoute(deps));
    app.route('/api', instructDossierRoute(deps));
    app.route('/api', completeDossierRoute(deps));
    app.route('/api', resumeDossierRoute(deps));
    app.route('/api', waitingTypeDossierRoute(deps));
    app.route('/api', uploadDossierRoute(deps));
    app.route('/api', downloadDossierRoute(deps));
    app.route('/api', listSessionsRoute(deps));
    app.route('/api', stopSessionRoute(deps));
    app.route('/api', listMemoryRoute(deps));
    app.route('/api', promptMemoryRoute(deps));
    app.route('/api', createMemoryRoute(deps));
    app.route('/api', readMemoryRoute(deps));
    app.route('/api', updateMemoryRoute(deps));
    app.route('/api', archiveMemoryRoute(deps));
    app.route('/api', listSuggestionsRoute(deps));
    app.route('/api', approveSuggestionRoute(deps));
    app.route('/api', dismissSuggestionRoute(deps));
    app.route('/api', listAmeliorationsRoute(deps));
    app.route('/api', resolveAmeliorationRoute(deps));
    app.route('/api', ignoreAmeliorationRoute(deps));
    app.route('/api', hookRoute(deps));
    app.route('/api', webhookGmailRoute(deps));
    // System routes
    app.route('/api', healthRoute(deps));
    app.route('/api', resetRoute(deps));
    app.route('/api', processesRoute(deps));
    app.route('/api', eventsRoute(deps));
    app.route('/api', testTasksRoute(deps));
    // Terminal routes
    app.route('/api', terminalPortRoute(deps));
    // Notification routes
    app.route('/api', notificationsRecentRoute(deps));
    // Checkup routes
    app.route('/api', checkupTriggerRoute(deps));
    // Scheduler routes
    if (deps.scheduler) {
      app.route('/api', schedulerRoutes({ scheduler: deps.scheduler }));
    }
    // MCP management routes
    if (deps.mcpConfig) {
      app.route('/api', listMcpRoute(deps.mcpConfig));
      app.route('/api', toggleMcpRoute(deps.mcpConfig));
      app.route('/api', addMcpRoute(deps.mcpConfig));
      app.route('/api', removeMcpRoute(deps.mcpConfig));
      app.route('/api', registrySearchRoute(deps.mcpConfig));
      app.route('/api', setupWizardRoute(deps.mcpConfig));
      app.route('/api', agentsRoute(deps.mcpConfig));
    }
    // Skills management routes
    if (deps.skillsConfig) {
      app.route('/api', listSkillsRoute(deps.skillsConfig));
      app.route('/api', toggleSkillRoute(deps.skillsConfig));
      app.route('/api', addSkillRoute(deps.skillsConfig));
      app.route('/api', removeSkillRoute(deps.skillsConfig));
    }
    // Setup routes
    if (deps.setupDeps) {
      app.route('/api', setupStatusRoute(deps.setupDeps));
    }
    if (deps.configFns) {
      app.route('/api', setupUserInfoRoute(deps.configFns));
      app.route('/api', setupCompleteRoute(deps.configFns));
    }
    app.route('/api', setupPermissionsRoute({ checkPermission: defaultCheckPermission }));
    if (deps.agentSetupDeps) {
      app.route('/api', setupAgentsRoute(deps.agentSetupDeps));
    }
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
