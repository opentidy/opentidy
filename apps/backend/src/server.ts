// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { createAuthMiddleware } from './shared/auth.js';
import type { SSEClient } from './shared/sse.js';
import { ZodError } from 'zod';
import type { Job, Session, Suggestion, Amelioration, NotificationRecord, AuditEntry, SSEEvent, MemoryEntry, MemoryIndexEntry, ClaudeProcess } from '@opentidy/shared';
// Job routes
import { listJobsRoute } from './features/jobs/list.js';
import { getJobRoute } from './features/jobs/get.js';
import { createJobRoute } from './features/jobs/create.js';
import { instructJobRoute } from './features/jobs/instruct.js';
import { completeJobRoute } from './features/jobs/complete.js';
import { resumeJobRoute } from './features/jobs/resume.js';
import { waitingTypeJobRoute } from './features/jobs/waiting-type.js';
import { uploadJobRoute } from './features/jobs/upload.js';
import { downloadJobRoute } from './features/jobs/download.js';
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
import { auditRoute } from './features/system/audit-route.js';
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
// Module routes
import { listModulesRoute } from './features/modules/list.js';
import { enableModuleRoute } from './features/modules/enable.js';
import { disableModuleRoute } from './features/modules/disable.js';
import { configureModuleRoute } from './features/modules/configure.js';
import { addModuleRoute } from './features/modules/add.js';
import { removeModuleRoute } from './features/modules/remove.js';
import { moduleHealthRoute } from './features/modules/health.js';
import { verifyModuleRoute } from './features/modules/verify.js';
import { webhookRoute } from './features/modules/webhook.js';
import type { ModuleRouteDeps } from './features/modules/types.js';
import type { WebhookDeps } from './features/modules/webhook.js';
// Setup routes
import { setupStatusRoute, type SetupDeps } from './features/setup/status.js';
import { setupUserInfoRoute, type UserInfoDeps } from './features/setup/user-info.js';
import { setupCompleteRoute } from './features/setup/complete.js';
import { setupPermissionsRoute, defaultCheckPermission, type PermissionsDeps } from './features/setup/permissions.js';
import { setupAgentsRoute, type AgentSetupDeps } from './features/setup/agents.js';
// Permission routes
import { permissionCheckRoute } from './features/permissions/route.js';
import { permissionRespondRoute } from './features/permissions/respond.js';
import { permissionConfigRoute } from './features/permissions/config-route.js';
import type { PermissionCheckDeps } from './features/permissions/types.js';
import type { ModuleManifest, PermissionConfig } from '@opentidy/shared';

export interface AppDeps {
  workspace: {
    listJobIds: (dir: string) => string[];
    getJob: (dir: string, id: string) => Job;
    jobManager: {
      createJob(id: string, instruction: string, confirm?: boolean, title?: string): void;
      createJobFromSuggestion(slug: string, instruction?: string): void;
      completeJob(id: string): void;
      saveArtifact(id: string, filename: string, buffer: Buffer): void;
    };
    suggestionsManager: { listSuggestions(): Suggestion[]; ignoreSuggestion(slug: string): void };
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
  terminal?: {
    ensureReady: (sessionName: string) => Promise<number | undefined>;
    runCommand?: (command: string) => Promise<{ sessionName: string; port: number }>;
  };
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
  moduleDeps?: ModuleRouteDeps;
  webhookDeps?: WebhookDeps;
  setupDeps?: SetupDeps;
  agentSetupDeps?: AgentSetupDeps;
  configFns?: {
    loadConfig: () => any;
    saveConfig: (config: any) => void;
  };
  permissionDeps?: {
    checkerDeps: PermissionCheckDeps;
    approvalManager: {
      respond(approvalId: string, approved: boolean): boolean;
      listPending(): Array<{ id: string; jobId: string; toolName: string; toolInput: Record<string, unknown>; moduleName: string | null; summary: string; createdAt: string }>;
    };
    manifests: Map<string, ModuleManifest>;
    loadConfig: () => { permissions: PermissionConfig };
    saveConfig: (update: (cfg: Record<string, unknown>) => void) => void;
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
    app.route('/api', listJobsRoute(deps));
    app.route('/api', getJobRoute(deps));
    app.route('/api', createJobRoute(deps));
    app.route('/api', instructJobRoute(deps));
    app.route('/api', completeJobRoute(deps));
    app.route('/api', resumeJobRoute(deps));
    app.route('/api', waitingTypeJobRoute(deps));
    app.route('/api', uploadJobRoute(deps));
    app.route('/api', downloadJobRoute(deps));
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
    app.route('/api', auditRoute(deps));
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
    // Module routes
    if (deps.moduleDeps) {
      app.route('/api', listModulesRoute(deps.moduleDeps));
      app.route('/api', enableModuleRoute(deps.moduleDeps));
      app.route('/api', disableModuleRoute(deps.moduleDeps));
      app.route('/api', configureModuleRoute(deps.moduleDeps));
      app.route('/api', addModuleRoute(deps.moduleDeps));
      app.route('/api', removeModuleRoute(deps.moduleDeps));
      app.route('/api', moduleHealthRoute(deps.moduleDeps));
      app.route('/api', verifyModuleRoute(deps.moduleDeps));
    }
    if (deps.webhookDeps) {
      app.route('/api', webhookRoute(deps.webhookDeps));
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
    // Permission check + approval + config routes
    if (deps.permissionDeps) {
      const { checkerDeps, approvalManager, manifests: permManifests, loadConfig: permLoadConfig, saveConfig: permSaveConfig } = deps.permissionDeps;
      app.route('/api', permissionCheckRoute(checkerDeps));
      app.route('/api', permissionRespondRoute({ approvalManager, sse: deps.sse }));
      app.route('/api', permissionConfigRoute({ loadConfig: permLoadConfig, saveConfig: permSaveConfig, manifests: permManifests }));
    }
  }

  // 404 handler for unknown API routes — must be after all route mounting
  app.all('/api/*', (c) => c.json({ error: 'Not found', path: c.req.path }, 404));

  // Static file serving — production only (when web-dist/ exists)
  const webDistPath = resolve(import.meta.dirname, '../web-dist');
  if (existsSync(webDistPath)) {
    // Block path traversal attempts before serving static files
    app.use('/*', async (c, next) => {
      const url = new URL(c.req.url);
      if (url.pathname.includes('..')) {
        return c.json({ error: 'Invalid path' }, 400);
      }
      await next();
    });
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
