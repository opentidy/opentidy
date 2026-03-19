// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createApp, startServer } from './server.js';
import { createLockManager } from './shared/locks.js';
import { createDedupStore } from './shared/dedup.js';
import { createAuditLogger } from './features/system/audit.js';
import { listDossierIds, getDossier } from './features/dossiers/state.js';
import { createDossierManager } from './features/dossiers/create-manager.js';
import { createSuggestionsManager } from './features/suggestions/parser.js';
import { createGapsManager } from './features/ameliorations/gaps.js';
import { createLauncher } from './features/sessions/launch.js';
import { createCheckup } from './features/checkup/sweep.js';
import { startPeriodicTasks } from './boot/periodic-tasks.js';
import { createTmuxExecutor } from './features/sessions/executor.js';
import { createNotifier } from './features/notifications/telegram.js';
import { createSSEEmitter } from './shared/sse.js';
import { createHooksHandler } from './features/hooks/handler.js';
import { createMemoryManager } from './features/memory/manager.js';
import { createMemoryAgents } from './features/memory/agents.js';
import { createWebhookReceiver } from './features/triage/webhook.js';
import { createTriager, createAgentRunner } from './features/triage/classify.js';
import { createTitleGenerator } from './features/dossiers/title.js';
import { createTerminalManager } from './features/terminal/bridge.js';
import { loadReceiverPlugins, type ReceiverPlugin } from './features/triage/plugin.js';
import { createNotificationStore } from './features/notifications/store.js';
import { createDatabase } from './shared/database.js';
import { createAgentTracker } from './shared/agent-tracker.js';
import { createTriageHandler } from './features/triage/route.js';
import { createSpawnAgent } from './shared/spawn-agent.js';
import { resolveAgent } from './shared/agents/index.js';
import { createGitHubIssueManager } from './features/ameliorations/github-issue.js';
import { createScheduler } from './features/scheduler/scheduler.js';
import { createMcpServer } from './features/mcp-server/server.js';
import { createGapRouter } from './features/ameliorations/route-gap.js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadConfig, getConfigPath } from './shared/config.js';
import { regenerateAgentConfig } from './shared/agent-config.js';
import { getVersion } from './cli.js';
import { getOpenTidyPaths } from './shared/paths.js';

const config = loadConfig(getConfigPath());
const openTidyPaths = getOpenTidyPaths();
const WORKSPACE_DIR = config.workspace.dir || process.env.WORKSPACE_DIR || path.resolve(import.meta.dirname, '../../..', 'workspace');
const LOCK_DIR = config.workspace.lockDir || process.env.LOCK_DIR || openTidyPaths.lockDir;
const PORT = config.server.port || parseInt(process.env.PORT || '5175', 10);
const CHECKUP_INTERVAL = parseInt(process.env.CHECKUP_INTERVAL_MS || '3600000', 10);
const TELEGRAM_TOKEN = config.telegram.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = config.telegram.chatId || process.env.TELEGRAM_CHAT_ID || '';
const APP_BASE_URL = config.server.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:5173';

export async function boot() {
// Ensure workspace dirs exist
fs.mkdirSync(`${WORKSPACE_DIR}/_suggestions`, { recursive: true });
fs.mkdirSync(`${WORKSPACE_DIR}/_gaps`, { recursive: true });
fs.mkdirSync(`${WORKSPACE_DIR}/_audit`, { recursive: true });
fs.mkdirSync(`${WORKSPACE_DIR}/.claude`, { recursive: true });
fs.mkdirSync(`${WORKSPACE_DIR}/_outputs`, { recursive: true });

// Memory system
const memoryManager = createMemoryManager(WORKSPACE_DIR);
memoryManager.ensureDir();
// Clean stale memory lock from previous run
try { fs.rmSync(path.join(WORKSPACE_DIR, '_memory', '.lock'), { force: true }); } catch {}

// Hooks are defined in the opentidy-hooks plugin (plugins/opentidy-hooks/hooks/hooks.json)
// Plugin hooks are loaded by Claude Code via --plugin-dir flag in launchSession()
// This bypasses the known bug where settings.json hooks aren't loaded (GitHub #11544)
const pluginHooksPath = path.resolve(import.meta.dirname, '../../../plugins/opentidy-hooks/hooks/hooks.json');
if (fs.existsSync(pluginHooksPath)) {
  console.log(`[opentidy] Hooks plugin found at ${pluginHooksPath}`);
} else {
  console.warn(`[opentidy] WARNING: hooks plugin not found at ${pluginHooksPath}`);
}


// Boot infrastructure
console.log(`[opentidy] Starting with workspace: ${WORKSPACE_DIR}`);
const DATA_DIR = path.join(WORKSPACE_DIR, '_data');
const db = createDatabase(DATA_DIR);
const tracker = createAgentTracker(db);
const locks = createLockManager(LOCK_DIR);
const cleaned = locks.cleanupStaleLocks();
if (cleaned.length) console.log(`[opentidy] Cleaned ${cleaned.length} stale locks`);

// Camoufox profile cleanup — only on macOS where Camoufox is used
if (process.platform === 'darwin') {
  try {
    const health = execFileSync('curl', ['-fsS', 'http://localhost:9377/health'], { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(health);
    if (data.ok) {
      console.log(`[opentidy] Camoufox server healthy (v${data.version})`);
      const profileDir = path.join(os.homedir(), '.camofox', 'profiles', 'default');
      if (fs.existsSync(path.join(profileDir, 'compatibility.ini'))) {
        const compat = fs.readFileSync(path.join(profileDir, 'compatibility.ini'), 'utf-8');
        const lastVersion = compat.match(/LastVersion=(.+)/)?.[1];
        if (lastVersion && !lastVersion.includes(data.version)) {
          fs.rmSync(profileDir, { recursive: true, force: true });
          console.log(`[opentidy] Removed incompatible Camoufox profile (was ${lastVersion}, server is ${data.version})`);
        }
      }
    }
  } catch {
    console.log('[opentidy] Camoufox server not running or not reachable — skipping profile check');
  }
}

const dedup = createDedupStore(db);
const audit = createAuditLogger(`${WORKSPACE_DIR}/_audit`);
const sse = createSSEEmitter();
const notificationStore = createNotificationStore(db);

// Agent adapter — resolves from config (claude by default)
const AGENT_CONFIG_DIR = config.agentConfig?.configDir || config.claudeConfig?.dir || '';
const adapter = resolveAgent({ configDir: path.dirname(AGENT_CONFIG_DIR) || path.join(os.homedir(), '.config', 'opentidy'), configAgent: config.agentConfig?.name });

// Ensure agent settings.json is up-to-date on startup (MCP servers + skills)
const MCP_ENV_DIR = path.join(path.dirname(getConfigPath()), 'mcp');
regenerateAgentConfig(config, MCP_ENV_DIR);

// Centralized agent spawner — ONE semaphore shared by all callers (max 3 concurrent)
const spawnAgentFull = createSpawnAgent({
  adapter,
  tracker,
  sse,
  outputDir: path.join(WORKSPACE_DIR, '_outputs'),
  maxConcurrent: 3,
});

// Workspace managers (before memoryAgents — gap router needs gapsManager)
const dossierManager = createDossierManager(WORKSPACE_DIR);
const suggestionsManager = createSuggestionsManager(WORKSPACE_DIR);
const gapsManager = createGapsManager(WORKSPACE_DIR);

// GitHub Issue manager (optional — only if token configured)
const gitHubIssueManager = config.github?.token
  ? createGitHubIssueManager({
      token: config.github.token,
      owner: config.github.owner || 'opentidy',
      repo: config.github.repo || 'opentidy',
    })
  : null;

const gapRouter = gitHubIssueManager
  ? createGapRouter({
      gapsManager,
      gitHub: gitHubIssueManager,
      suggestionsDir: path.join(WORKSPACE_DIR, '_suggestions'),
      isDuplicateSuggestion: suggestionsManager.isDuplicateSuggestion,
    })
  : null;

if (gitHubIssueManager) {
  console.log(`[opentidy] GitHub integration enabled (${config.github!.owner}/${config.github!.repo})`);
}

const memoryAgents = createMemoryAgents(WORKSPACE_DIR, {
  spawnAgent: spawnAgentFull,
  adapter,
  onGapsWritten: gapRouter ? () => gapRouter.routeNewGaps() : undefined,
});

// Notifications (no-op if no token)
const sendMessage: (chatId: string, text: string, opts?: { parse_mode?: string }) => Promise<void> = TELEGRAM_TOKEN
  ? async (chatId: string, text: string, opts?: { parse_mode?: string }) => {
      const { Bot } = await import('grammy');
      const bot = new Bot(TELEGRAM_TOKEN);
      await bot.api.sendMessage(chatId || TELEGRAM_CHAT_ID, text, opts as any);
    }
  : async () => { console.log('[notifications] No Telegram token, skipping'); };
const notify = createNotifier({ sendMessage, appBaseUrl: APP_BASE_URL, chatId: TELEGRAM_CHAT_ID, notificationStore, sse });

// Launcher
const tmuxExecutor = createTmuxExecutor();
// Terminal ref — resolved after launcher is created (avoids TDZ circular ref)
let terminalRef: { ensureReady: (name: string) => Promise<number | undefined>; killTtyd: (sessionName: string) => void } | undefined;
const launcher = createLauncher({
  tmuxExecutor,
  locks,
  workspace: {
    getDossier: (id: string) => getDossier(WORKSPACE_DIR, id),
    listDossierIds: () => listDossierIds(WORKSPACE_DIR),
    dir: WORKSPACE_DIR,
  },
  notify,
  sse,
  workspaceDir: WORKSPACE_DIR,
  terminal: {
    ensureReady: (name: string) => terminalRef?.ensureReady(name) ?? Promise.resolve(undefined),
    killTtyd: (name: string) => terminalRef?.killTtyd(name),
  },
  adapter,
  memoryAgents,
});

// Terminal manager — ttyd spawner
const terminalManager = createTerminalManager({
  listSessions: () => launcher.listActiveSessions().map(s => s.id),
});
terminalRef = terminalManager;

// Hooks handler
const hooks = createHooksHandler({
  launcher,
  audit,
  notify,
  sse,
});

// Receiver — triage + webhook
const agentRunner = createAgentRunner(WORKSPACE_DIR, { memoryManager, spawnAgent: spawnAgentFull, adapter });
const triager = createTriager({
  runClaude: agentRunner,
  listDossiers: () => listDossierIds(WORKSPACE_DIR).map(id => {
    const d = getDossier(WORKSPACE_DIR, id);
    return { id: d.id, title: d.title, status: d.status, stateRaw: d.stateRaw ?? '' };
  }),
  listSuggestionTitles: () => suggestionsManager.listSuggestions().map(s => s.title),
});

// Shared triage result handler — deduplicates suggestion creation logic
const handleTriageResult = createTriageHandler({ launcher, sse, notify, workspaceDir: WORKSPACE_DIR });

async function triageAndHandle(event: { source: string; content: string }): Promise<void> {
  const result = await triager.triage(event);
  await handleTriageResult(result, event);
}

const receiver = createWebhookReceiver({
  dedup,
  triage: triageAndHandle,
});

// Dynamic receiver loading — config-driven
const receiverPlugins: ReceiverPlugin[] = await loadReceiverPlugins({ receivers: config.receivers ?? [] });
for (const plugin of receiverPlugins) {
  await plugin.init();
  plugin.start((msg) => {
    // Dedup on JSON.stringify to match existing createWatcher behavior
    const raw = JSON.stringify(msg);
    if (dedup.isDuplicate(raw)) return;
    dedup.record(raw);
    console.log(`[receiver] ${plugin.source} message from ${msg.from}`);
    triageAndHandle({
      source: plugin.source,
      content: `${plugin.source} de ${msg.from}: ${msg.body}`,
    });
  });
  console.log(`[opentidy] Receiver started: ${plugin.name}`);
}

// Checkup
const checkup = createCheckup({ launcher, workspaceDir: WORKSPACE_DIR, intervalMs: CHECKUP_INTERVAL, spawnAgent: spawnAgentFull, adapter, sse, notificationStore, memoryManager, suggestionsManager });

// Scheduler — unified scheduling engine (replaces checkup setInterval)
const scheduler = createScheduler({ db, launcher, checkup, locks, sse });

// MCP server — embedded in Hono, exposes schedule/suggestion/gap tools
const mcpServer = createMcpServer({ scheduler, suggestionsManager, gapsManager, sse });

// Title generator — agent one-shot for descriptive dossier titles
const generateTitle = createTitleGenerator(WORKSPACE_DIR, { spawnAgent: spawnAgentFull, adapter });

// API
const app = createApp({
  workspace: {
    listDossierIds: (dir: string) => listDossierIds(dir),
    getDossier: (dir: string, id: string) => getDossier(dir, id),
    dossierManager,
    suggestionsManager,
    gapsManager,
  },
  launcher,
  hooks: { handleHook: (body: unknown) => hooks.handle(body as any) },
  receiver,
  checkup,
  notify,
  sse,
  terminal: terminalManager,
  notificationStore,
  audit,
  generateTitle,
  memoryManager,
  memoryAgents,
  tracker,
  scheduler,
  mcpServer,
  workspaceDir: WORKSPACE_DIR,
  bearerToken: config.auth.bearerToken || '',
  version: getVersion(),
  mcpConfig: {
    configPath: getConfigPath(),
    agentConfigDir: AGENT_CONFIG_DIR,
    mcpEnvDir: MCP_ENV_DIR,
  },
  skillsConfig: {
    configPath: getConfigPath(),
    agentConfigDir: AGENT_CONFIG_DIR,
  },
});

const server = startServer(app, PORT);

// Periodic tasks — recovery, checkup sweep, daily cleanup, workspace watcher
const periodic = startPeriodicTasks({
  launcher,
  scheduler,
  tracker,
  dedup,
  sse,
  workspaceDir: WORKSPACE_DIR,
});

// Graceful shutdown — clean up resources on SIGTERM/SIGINT
function gracefulShutdown(signal: string): void {
  console.log(`[opentidy] ${signal} received, shutting down gracefully...`);
  for (const plugin of receiverPlugins) { plugin.stop(); }
  periodic.stop();
  server.close(() => {
    db.close();
    console.log('[opentidy] Database closed');
    console.log('[opentidy] Server closed');
    process.exit(0);
  });
  // Force exit if server doesn't close within 5s
  setTimeout(() => {
    console.warn('[opentidy] Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
} // end boot()

// Auto-start when run directly (not via cli.ts)
const isDirectRun = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isDirectRun) {
  boot().catch(err => {
    console.error('[boot] Fatal:', err);
    process.exit(1);
  });
}