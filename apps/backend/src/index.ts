// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createApp, startServer } from './server.js';
import { createLockManager } from './shared/locks.js';
import { createDedupStore } from './shared/dedup.js';
import { createAuditLogger } from './features/system/audit.js';
import { listTaskIds, getTask } from './features/tasks/state.js';
import { createTaskManager } from './features/tasks/create-manager.js';
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
import { createTriager, createAgentRunner } from './features/triage/classify.js';
import { createTitleGenerator } from './features/tasks/title.js';
import { createTerminalManager } from './features/terminal/bridge.js';
import { createNotificationStore } from './features/notifications/store.js';
import { loadCuratedModules, loadCustomModules } from './features/modules/loader.js';
import { createModuleLifecycle } from './features/modules/lifecycle.js';
import { createDatabase } from './shared/database.js';
import { createAgentTracker } from './shared/agent-tracker.js';
import { createSessionHistory } from './features/sessions/history.js';
import { createTriageHandler } from './features/triage/route.js';
import { createSpawnAgent } from './shared/spawn-agent.js';
import { resolveAgent } from './shared/agents/index.js';
import { createGitHubIssueManager } from './features/ameliorations/github-issue.js';
import { createScheduler } from './features/scheduler/scheduler.js';
import { createUpdater } from './shared/updater.js';
import { createMcpServer } from './features/mcp-server/server.js';
import { createDynamicToolRegistry } from './features/mcp-server/dynamic-tools.js';
import { resolveProvider as resolveSearchProvider } from './features/modules/search-provider.js';
import { createGapRouter } from './features/ameliorations/route-gap.js';
import { createPermissionResolver } from './features/permissions/resolver.js';
import { createPermissionState } from './features/permissions/state.js';
import { createApprovalManager } from './features/permissions/approval.js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadConfig, saveConfig, getConfigPath } from './shared/config.js';
import { regenerateAgentConfig } from './shared/agent-config.js';
import { createKeychainAdapter } from './shared/keychain.js';
import { trustDirectory } from './shared/agents/claude.js';
import { getVersion } from './cli.js';
import { getOpenTidyPaths } from './shared/paths.js';

const config = loadConfig(getConfigPath());
const openTidyPaths = getOpenTidyPaths();
const WORKSPACE_DIR = config.workspace.dir || process.env.WORKSPACE_DIR || path.resolve(import.meta.dirname, '../../..', 'workspace');
const LOCK_DIR = config.workspace.lockDir || process.env.LOCK_DIR || openTidyPaths.lockDir;
const PORT = config.server.port || parseInt(process.env.PORT || '5175', 10);
const CHECKUP_INTERVAL = parseInt(process.env.CHECKUP_INTERVAL_MS || '3600000', 10);
const TELEGRAM_TOKEN = (config.modules?.telegram?.config?.botToken as string) || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = (config.modules?.telegram?.config?.chatId as string) || process.env.TELEGRAM_CHAT_ID || '';
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
const sessionHistory = createSessionHistory(db);
const locks = createLockManager(LOCK_DIR);
const cleaned = locks.cleanupStaleLocks();
if (cleaned.length) console.log(`[opentidy] Cleaned ${cleaned.length} stale locks`);

// Camoufox profile cleanup (only on macOS where Camoufox is used)
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
    console.log('[opentidy] Camoufox server not running or not reachable, skipping profile check');
  }
}

const dedup = createDedupStore(db);
const audit = createAuditLogger(`${WORKSPACE_DIR}/_audit`);
const sse = createSSEEmitter();
const notificationStore = createNotificationStore(db);

// Agent adapter: resolves from config (claude by default)
const AGENT_CONFIG_DIR = config.agentConfig?.configDir || config.claudeConfig?.dir || path.join(os.homedir(), '.config', 'opentidy', 'agents', 'claude');
// Persist the resolved configDir so regenerateAgentConfig can find it
if (!config.agentConfig?.configDir) {
  config.agentConfig = { ...config.agentConfig, name: config.agentConfig?.name ?? 'claude', configDir: AGENT_CONFIG_DIR };
  saveConfig(getConfigPath(), config);
  console.log(`[opentidy] Persisted agent configDir: ${AGENT_CONFIG_DIR}`);
}
const adapter = resolveAgent({ configDir: AGENT_CONFIG_DIR, configAgent: config.agentConfig?.name });

// Load curated module manifests
const modulesDir = path.resolve(import.meta.dirname, '../modules');
const manifests = loadCuratedModules(modulesDir);
console.log(`[opentidy] Loaded ${manifests.size} curated modules`);

// Load custom modules from ~/.config/opentidy/modules/
fs.mkdirSync(openTidyPaths.customModules, { recursive: true });
const customModules = loadCustomModules(openTidyPaths.customModules, new Set(manifests.keys()));
for (const [name, manifest] of customModules) {
  manifests.set(name, manifest);
}
if (customModules.size > 0) {
  console.log(`[opentidy] Loaded ${customModules.size} custom modules`);
  // Auto-register custom modules found on disk that aren't in config yet
  let configDirty = false;
  for (const [name] of customModules) {
    if (!config.modules[name]) {
      config.modules[name] = { enabled: false, source: 'custom' as const };
      configDirty = true;
    }
  }
  if (configDirty) saveConfig(getConfigPath(), config);
}

// Permission resolver: determines allowed tools from manifests + config
const permissionResolver = createPermissionResolver(manifests, config.permissions);

// Ensure agent settings.json is up-to-date on startup (from modules)
regenerateAgentConfig(config, undefined, config.modules, manifests, modulesDir);

// Pre-trust workspace directory so Claude Code doesn't show the trust dialog for task subdirectories
if (adapter.name === 'claude') {
  trustDirectory(AGENT_CONFIG_DIR, WORKSPACE_DIR);
}

// Generate hooks.json from permission config (into the plugin dir used by --plugin-dir)
const pluginHooksDir = path.resolve(import.meta.dirname, '../../../plugins/opentidy-hooks');
adapter.writeConfig({
  permissionConfig: config.permissions,
  manifests,
  mcpServices: {} as any,
  configDir: pluginHooksDir,
  serverPort: config.server.port,
});
console.log('[opentidy] Generated hooks.json from permission config');

// Centralized agent spawner: ONE semaphore shared by all callers (max 3 concurrent)
const spawnAgentFull = createSpawnAgent({
  adapter,
  tracker,
  sse,
  outputDir: path.join(WORKSPACE_DIR, '_outputs'),
  maxConcurrent: 3,
});

// Workspace managers (before memoryAgents, gap router needs gapsManager)
const taskManager = createTaskManager(WORKSPACE_DIR);
const suggestionsManager = createSuggestionsManager(WORKSPACE_DIR);
const gapsManager = createGapsManager(WORKSPACE_DIR);

// GitHub Issue manager (optional, only if token configured)
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
const notify = createNotifier({ sendMessage, appBaseUrl: APP_BASE_URL, chatId: TELEGRAM_CHAT_ID, rateLimitMs: config.preferences?.notificationRateLimit ?? 60_000, notificationStore, sse });

// Permission services: state, approval flow, and per-request checker
const permissionState = createPermissionState();

const approvalManager = createApprovalManager({
  summarize: async (toolName: string, toolInput: Record<string, unknown>) => {
    const params = Object.entries(toolInput)
      .filter(([, v]) => typeof v === 'string' && (v as string).length < 100)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return params ? `${toolName} (${params})` : toolName;
  },
  sendConfirmation: async (approvalId, taskId, _toolName, _toolInput, _moduleName, summary) => {
    const text = `🔔 Task ${taskId} requests permission\n${summary}\n\nApprove: ${APP_BASE_URL}/api/permissions/${approvalId}/approve\nDeny: ${APP_BASE_URL}/api/permissions/${approvalId}/deny`;
    await notify.notifyAction(taskId, text);
  },
});

// Launcher
const tmuxExecutor = createTmuxExecutor();
// Terminal ref, resolved after launcher is created (avoids TDZ circular ref)
let terminalRef: { ensureReady: (name: string) => Promise<number | undefined>; killTtyd: (sessionName: string) => void } | undefined;
const launcher = createLauncher({
  tmuxExecutor,
  locks,
  workspace: {
    getTask: (id: string) => getTask(WORKSPACE_DIR, id),
    listTaskIds: () => listTaskIds(WORKSPACE_DIR),
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
  getAllowedTools: () => permissionResolver.getAllowedTools(),
  memoryAgents,
  modules: { manifests, loadConfig: () => loadConfig(getConfigPath()) },
  sessionHistory,
});

// Terminal manager: ttyd spawner
const terminalManager = createTerminalManager({
  listSessions: () => launcher.listActiveSessions().map(s => s.id),
});
terminalRef = terminalManager;

// Module setup session tracker: shared between terminal route (writes) and verify route (reads)
const setupSessions = new Map<string, string>(); // moduleName → tmux sessionName
const setupTracker = {
  async getStatus(moduleName: string): Promise<{ running: boolean; exitCode?: number } | null> {
    const sessionName = setupSessions.get(moduleName);
    if (!sessionName) return null;
    return terminalManager.getSessionStatus(sessionName);
  },
};

// Hooks handler
const hooks = createHooksHandler({
  launcher,
  audit,
  notify,
  sse,
  onSessionEnd: (taskId) => {
    permissionState.revokeTask(taskId);
    approvalManager.cancelTask(taskId);
  },
});

// Receiver: triage + webhook
const agentRunner = createAgentRunner(WORKSPACE_DIR, { memoryManager, spawnAgent: spawnAgentFull, adapter });
const triager = createTriager({
  runClaude: agentRunner,
  listTasks: () => listTaskIds(WORKSPACE_DIR).map(id => {
    const d = getTask(WORKSPACE_DIR, id);
    return { id: d.id, title: d.title, status: d.status, stateRaw: d.stateRaw ?? '' };
  }),
  listSuggestionTitles: () => suggestionsManager.listSuggestions().map(s => s.title),
});

// Shared triage result handler: deduplicates suggestion creation logic
const handleTriageResult = createTriageHandler({ launcher, sse, notify, writeSuggestion: suggestionsManager.writeSuggestion });

// Triage batcher: accumulates events and flushes in a single agent call
const TRIAGE_DEBOUNCE_MS = 60_000;       // 1 min of silence → flush
const TRIAGE_MAX_DELAY_MS = 5 * 60_000;  // 5 min max wait → force flush
let triageBuffer: Array<{ source: string; content: string }> = [];
let triageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let triageMaxTimer: ReturnType<typeof setTimeout> | null = null;
let triageFlushing = false;

async function flushTriageBuffer(): Promise<void> {
  if (triageDebounceTimer) { clearTimeout(triageDebounceTimer); triageDebounceTimer = null; }
  if (triageMaxTimer) { clearTimeout(triageMaxTimer); triageMaxTimer = null; }
  if (triageBuffer.length === 0 || triageFlushing) return;

  const events = triageBuffer;
  triageBuffer = [];
  triageFlushing = true;

  try {
    console.log(`[triage] Flushing batch of ${events.length} event(s)`);
    const results = await triager.triageBatch(events);
    for (let i = 0; i < Math.min(results.length, events.length); i++) {
      await handleTriageResult(results[i], events[i]);
    }
  } catch (err) {
    console.error('[triage] Batch flush failed:', err);
  } finally {
    triageFlushing = false;
    // If new events arrived during flush, schedule another
    if (triageBuffer.length > 0) {
      triageDebounceTimer = setTimeout(() => { flushTriageBuffer(); }, TRIAGE_DEBOUNCE_MS);
    }
  }
}

function queueForTriage(event: { source: string; content: string }): void {
  triageBuffer.push(event);
  console.log(`[triage] Event queued (buffer: ${triageBuffer.length})`);

  if (triageDebounceTimer) clearTimeout(triageDebounceTimer);
  triageDebounceTimer = setTimeout(() => { flushTriageBuffer(); }, TRIAGE_DEBOUNCE_MS);

  // Force flush if first event has been waiting too long
  if (!triageMaxTimer) {
    triageMaxTimer = setTimeout(() => { flushTriageBuffer(); }, TRIAGE_MAX_DELAY_MS);
  }
}


// Shared config access: single configPath used by all subsystems
const configPath = getConfigPath();
const configFns = {
  loadConfig: () => loadConfig(configPath),
  saveConfig: (cfg: any) => saveConfig(configPath, cfg),
};

// Dynamic tool registry: daemon modules register tools here
const dynamicToolRegistry = createDynamicToolRegistry();

const keychain = createKeychainAdapter();

// Module lifecycle: manages enable/disable/configure and receiver start/stop
const moduleLifecycle = createModuleLifecycle({
  loadConfig: configFns.loadConfig,
  saveConfig: configFns.saveConfig,
  manifests,
  regenerateAgentConfig: (modules, mans) => {
    regenerateAgentConfig(config, undefined, modules, mans, modulesDir);
  },
  triageHandler: async (event) => {
    queueForTriage({ source: event.source, content: event.content });
  },
  dedup,
  sse,
  modulesBaseDir: modulesDir,
  dynamicToolRegistry,
  modulesDataBaseDir: path.join(openTidyPaths.config, 'module-data'),
  keychain,
});

// Start receivers and daemons for enabled modules
for (const [name, state] of Object.entries(config.modules)) {
  if (state.enabled && manifests.has(name)) {
    moduleLifecycle.startReceivers(name).catch(err => {
      console.error(`[modules] Failed to start receivers for ${name}:`, err);
    });
    moduleLifecycle.startDaemon(name).catch(err => {
      console.error(`[modules] Failed to start daemon for ${name}:`, err);
    });
  }
}

// Checkup
const checkup = createCheckup({ launcher, workspaceDir: WORKSPACE_DIR, intervalMs: CHECKUP_INTERVAL, spawnAgent: spawnAgentFull, adapter, sse, notificationStore, memoryManager, suggestionsManager, writeSuggestion: suggestionsManager.writeSuggestion });

// Scheduler: unified scheduling engine (replaces checkup setInterval)
// Resolve scan interval from preferences config
const SCAN_INTERVAL_MAP: Record<string, number> = { '30m': 1_800_000, '1h': 3_600_000, '2h': 7_200_000, '6h': 21_600_000 };
const configuredScanInterval = config.preferences?.scanInterval ?? '2h';
const checkupIntervalMs = configuredScanInterval === 'disabled' ? 0 : (SCAN_INTERVAL_MAP[configuredScanInterval] ?? 7_200_000);
const scheduler = createScheduler({ db, launcher, checkup, locks, sse, checkupIntervalMs });

// Auto-updater: checks GitHub Releases periodically
const updater = config.update?.autoUpdate !== false
  ? createUpdater({
      currentVersion: getVersion(),
      repoOwner: 'opentidy',
      repoName: 'opentidy',
      checkInterval: config.update?.checkInterval ?? '6h',
      autoUpdate: true,
      notifyBeforeUpdate: config.update?.notifyBeforeUpdate ?? true,
      delayBeforeUpdate: config.update?.delayBeforeUpdate ?? '5m',
      sendTelegram: (text) => notify.notifyAction('system', text),
      updaterScriptPath: path.resolve(import.meta.dirname, '../../../opentidy-updater.sh'),
      telegramBotToken: TELEGRAM_TOKEN,
      telegramChatId: TELEGRAM_CHAT_ID,
    })
  : null;

if (updater) {
  updater.start();
  console.log('[opentidy] Auto-updater enabled');
} else {
  console.log('[opentidy] Auto-updater disabled (config.update.autoUpdate = false)');
}

// MCP server: embedded in Hono, exposes schedule/suggestion/gap/module tools
const mcpServer = createMcpServer({
  scheduler,
  suggestionsManager: suggestionsManager as any,
  gapsManager: gapsManager as any,
  sse,
  manifests,
  paths: openTidyPaths,
  lifecycle: moduleLifecycle,
  resolveSearchProvider,
  dynamicToolRegistry,
});

// Title generator: agent one-shot for descriptive task titles
const generateTitle = createTitleGenerator(WORKSPACE_DIR, { spawnAgent: spawnAgentFull, adapter });

// API
const app = createApp({
  workspace: {
    listTaskIds: (dir: string) => listTaskIds(dir),
    getTask: (dir: string, id: string) => getTask(dir, id),
    taskManager,
    suggestionsManager,
    gapsManager,
  },
  launcher,
  hooks: { handleHook: (body: unknown) => hooks.handle(body as any) },
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
  sessionHistory,
  scheduler,
  mcpServer,
  db,
  workspaceDir: WORKSPACE_DIR,
  bearerToken: config.auth.bearerToken || '',
  version: getVersion(),
  moduleDeps: {
    manifests,
    loadConfig: configFns.loadConfig,
    lifecycle: moduleLifecycle,
    saveConfig: configFns.saveConfig,
    setupTracker,
    keychain,
  },
  modulePaths: { curated: modulesDir, custom: openTidyPaths.customModules },
  onModuleSetup: (name: string, session: string) => setupSessions.set(name, session),
  createSessionDeps: {
    paths: openTidyPaths,
    taskManager,
    launcher,
  },
  webhookDeps: {
    manifests,
    loadConfig: configFns.loadConfig,
    modulesBaseDir: modulesDir,
    dedup,
  },
  setupDeps: {
    loadConfig: configFns.loadConfig,
    checkAgentInstalled: (agent) => {
      try { execFileSync('which', [agent], { encoding: 'utf-8', timeout: 5000 }); return true; } catch { return false; }
    },
    // TODO: checkAgentAuth currently only checks if the binary exists (same as checkAgentInstalled).
    // It should eventually call the adapter's auth check (e.g. `claude auth status`) to verify
    // the agent is actually authenticated, not just installed.
    checkAgentAuth: (agent) => {
      try { execFileSync('which', [agent], { encoding: 'utf-8', timeout: 5000 }); return true; } catch { return false; }
    },
  },
  configFns,
  preferencesDeps: {
    loadConfig: configFns.loadConfig,
    saveConfig: (cfg: any) => configFns.saveConfig(cfg),
    scheduler,
  },
  permissionDeps: {
    checkerDeps: {
      manifests,
      loadConfig: () => loadConfig(getConfigPath()).permissions,
      state: permissionState,
      requestApproval: (opts) => approvalManager.requestApproval(opts),
      audit,
    },
    approvalManager,
    manifests,
    loadConfig: () => configFns.loadConfig(),
    saveConfig: (update: (cfg: Record<string, unknown>) => void) => {
      const cfg = configFns.loadConfig() as unknown as Record<string, unknown>;
      update(cfg);
      configFns.saveConfig(cfg as any);
    },
    regenerateHooks: () => {
      const freshConfig = configFns.loadConfig();
      adapter.writeConfig({
        permissionConfig: freshConfig.permissions,
        manifests,
        mcpServices: {} as any,
        configDir: pluginHooksDir,
        serverPort: freshConfig.server.port,
      });
      console.log('[opentidy] Regenerated hooks.json after permission change');
    },
  },
  agentSetupDeps: {
    checkInstalled: (name) => {
      try { execFileSync('which', [name], { encoding: 'utf-8', timeout: 5000 }); return true; } catch { return false; }
    },
    checkAuth: (name) => {
      // Agent config dir must exist; if cleared (e.g., after reset), agent is not authed
      if (!fs.existsSync(AGENT_CONFIG_DIR)) return false;
      try {
        const out = execFileSync(name, ['auth', 'status'], {
          encoding: 'utf-8',
          timeout: 10_000,
          env: { ...process.env, CLAUDE_CONFIG_DIR: AGENT_CONFIG_DIR },
        });
        const status = JSON.parse(out);
        return status.loggedIn === true;
      } catch { return false; }
    },
    getActiveAgent: () => config.agentConfig?.name ?? 'claude',
    agentConfigDir: AGENT_CONFIG_DIR,
  },
});

const server = startServer(app, PORT);

// Periodic tasks: recovery, checkup sweep, daily cleanup, workspace watcher
const periodic = startPeriodicTasks({
  launcher,
  scheduler,
  tracker,
  dedup,
  sse,
  workspaceDir: WORKSPACE_DIR,
});

// Graceful shutdown: clean up resources on SIGTERM/SIGINT
function gracefulShutdown(signal: string): void {
  console.log(`[opentidy] ${signal} received, shutting down gracefully...`);
  updater?.stop();
  moduleLifecycle.stopAll().catch(() => {});
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