import { createApp, startServer } from './server.js';
import { createLockManager } from './infra/locks.js';
import { createDedupStore } from './infra/dedup.js';
import { createAuditLogger } from './infra/audit.js';
import { listDossierIds, getDossier } from './workspace/state.js';
import { createDossierManager } from './workspace/dossier.js';
import { createSuggestionsManager } from './workspace/suggestions.js';
import { createGapsManager } from './workspace/gaps.js';
import { createLauncher } from './launcher/session.js';
import { createCheckup } from './launcher/checkup.js';
import { createWorkspaceWatcher } from './launcher/watchdog.js';
import { createTmuxExecutor } from './launcher/tmux-executor.js';
import { createNotifier } from './notifications/telegram.js';
import { createSSEEmitter } from './sse/emitter.js';
import { createHooksHandler } from './hooks/handler.js';
import { createMemoryManager, createMemoryAgents } from './memory/index.js';
import { createWebhookReceiver } from './receiver/webhook.js';
import { createTriager, createClaudeRunner } from './receiver/triage.js';
import { createTitleGenerator } from './workspace/title.js';
import { createTerminalManager } from './terminal/bridge.js';
import { createSmsReader } from './receiver/sms-reader.js';
import { createMailReader } from './receiver/mail-reader.js';
import { createWatcher } from './receiver/watchers.js';
import { createNotificationStore } from './infra/notification-store.js';
import { createDatabase } from './infra/database.js';
import { createClaudeTracker } from './infra/claude-tracker.js';
import { createTriageHandler } from './utils/triage-handler.js';
import { createSpawnClaude } from './infra/spawn-claude.js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadConfig, getConfigPath } from './config.js';
import { getVersion } from './cli.js';

const config = loadConfig(getConfigPath());
const WORKSPACE_DIR = config.workspace.dir || process.env.WORKSPACE_DIR || path.resolve(import.meta.dirname, '../../..', 'workspace');
const LOCK_DIR = config.workspace.lockDir || process.env.LOCK_DIR || '/tmp/assistant-locks';
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

// Hooks are defined in the alfred-hooks plugin (plugins/alfred-hooks/hooks/hooks.json)
// Plugin hooks are loaded by Claude Code via --plugin-dir flag in launchSession()
// This bypasses the known bug where settings.json hooks aren't loaded (GitHub #11544)
const pluginHooksPath = path.resolve(import.meta.dirname, '../../../plugins/alfred-hooks/hooks/hooks.json');
if (fs.existsSync(pluginHooksPath)) {
  console.log(`[alfred] Hooks plugin found at ${pluginHooksPath}`);
} else {
  console.warn(`[alfred] WARNING: hooks plugin not found at ${pluginHooksPath}`);
}


// Boot infrastructure
console.log(`[alfred] Starting with workspace: ${WORKSPACE_DIR}`);
const DATA_DIR = path.join(WORKSPACE_DIR, '_data');
const db = createDatabase(DATA_DIR);
const tracker = createClaudeTracker(db);
const locks = createLockManager(LOCK_DIR);
const cleaned = locks.cleanupStaleLocks();
if (cleaned.length) console.log(`[alfred] Cleaned ${cleaned.length} stale locks`);

// Camoufox profile cleanup — prevent "older version" dialog blocking sessions
try {
  const health = execFileSync('curl', ['-fsS', 'http://localhost:9377/health'], { encoding: 'utf-8', timeout: 5000 });
  const data = JSON.parse(health);
  if (data.ok) {
    console.log(`[alfred] Camoufox server healthy (v${data.version})`);
    const profileDir = path.join(os.homedir(), '.camofox', 'profiles', 'default');
    if (fs.existsSync(path.join(profileDir, 'compatibility.ini'))) {
      const compat = fs.readFileSync(path.join(profileDir, 'compatibility.ini'), 'utf-8');
      const lastVersion = compat.match(/LastVersion=(.+)/)?.[1];
      if (lastVersion && !lastVersion.includes(data.version)) {
        fs.rmSync(profileDir, { recursive: true, force: true });
        console.log(`[alfred] Removed incompatible Camoufox profile (was ${lastVersion}, server is ${data.version})`);
      }
    }
  }
} catch {
  console.log('[alfred] Camoufox server not running or not reachable — skipping profile check');
}

const dedup = createDedupStore(db);
const audit = createAuditLogger(`${WORKSPACE_DIR}/_audit`);
const sse = createSSEEmitter();
const notificationStore = createNotificationStore(db);

// Centralized Claude spawner — ONE semaphore shared by all callers (max 3 concurrent)
const CLAUDE_CONFIG_DIR = config.claudeConfig.dir || '';
const spawnClaudeFull = createSpawnClaude({
  tracker,
  sse,
  outputDir: path.join(WORKSPACE_DIR, '_outputs'),
  maxConcurrent: 3,
  claudeConfigDir: CLAUDE_CONFIG_DIR || undefined,
});
// Simple wrapper for one-shot callers (triage, title, checkup, memory) — returns Promise<string>
const spawnClaude = (opts: Parameters<typeof spawnClaudeFull>[0]) => spawnClaudeFull(opts).promise;

const memoryAgents = createMemoryAgents(WORKSPACE_DIR, { spawnClaude });

// Notifications (no-op if no token)
const sendMessage: (chatId: string, text: string, opts?: { parse_mode?: string }) => Promise<void> = TELEGRAM_TOKEN
  ? async (chatId: string, text: string, opts?: { parse_mode?: string }) => {
      const { Bot } = await import('grammy');
      const bot = new Bot(TELEGRAM_TOKEN);
      await bot.api.sendMessage(chatId || TELEGRAM_CHAT_ID, text, opts as any);
    }
  : async () => { console.log('[notifications] No Telegram token, skipping'); };
const notify = createNotifier({ sendMessage, appBaseUrl: APP_BASE_URL, chatId: TELEGRAM_CHAT_ID, notificationStore, sse });

// Workspace managers
const dossierManager = createDossierManager(WORKSPACE_DIR);
const suggestionsManager = createSuggestionsManager(WORKSPACE_DIR);
const gapsManager = createGapsManager(WORKSPACE_DIR);

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
const claudeRunner = createClaudeRunner(WORKSPACE_DIR, { memoryManager, spawnClaude });
const triager = createTriager({
  runClaude: claudeRunner,
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

// SMS watcher (Messages.app via osascript)
const smsReader = createSmsReader();
const smsWatcher = createWatcher(
  { pollIntervalMs: 300_000, source: 'sms', getNewMessages: () => smsReader.getNewMessages() },
  { dedup, triage: triageAndHandle },
);
smsWatcher.start();
console.log('[alfred] SMS watcher started (5min poll)');

// Mail watcher (Mail.app via osascript — Gmail account connected)
const mailReader = createMailReader();
const mailWatcher = createWatcher(
  { pollIntervalMs: 300_000, source: 'mail', getNewMessages: () => mailReader.getNewMessages() },
  { dedup, triage: triageAndHandle },
);
mailWatcher.start();
console.log('[alfred] Mail watcher started (5min poll)');

// Checkup
const checkup = createCheckup({ launcher, workspaceDir: WORKSPACE_DIR, intervalMs: CHECKUP_INTERVAL, spawnClaude, sse, notificationStore, memoryManager, suggestionsManager });

// Title generator — claude -p one-shot for descriptive dossier titles
const generateTitle = createTitleGenerator(WORKSPACE_DIR, { spawnClaude });

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
  workspaceDir: WORKSPACE_DIR,
  bearerToken: config.auth.bearerToken || '',
  version: getVersion(),
});

const server = startServer(app, PORT);

// Recovery — reconcile tmux sessions with workspace state
launcher.recover().then(() => {
  console.log('[alfred] Recovery complete');
}).catch((err: unknown) => {
  console.error('[alfred] Recovery failed:', err);
});

// Checkup périodique
setInterval(() => {
  checkup.runCheckup().catch((err: unknown) => console.error('[alfred] Checkup failed:', err));
}, CHECKUP_INTERVAL);
console.log(`[alfred] Checkup every ${CHECKUP_INTERVAL / 1000}s`);

// Daily cleanup — remove old claude processes and dedup hashes
setInterval(() => {
  tracker.cleanup(30); // processes older than 30 days
  dedup.cleanup();     // hashes older than 7 days
  console.log('[alfred] Daily cleanup complete');
}, 86_400_000);
console.log('[alfred] Daily cleanup scheduled');

// Workspace watcher — fs.watch for dossier:updated SSE events
const watchdog = createWorkspaceWatcher({ sse, workspaceDir: WORKSPACE_DIR });
watchdog.start();
console.log('[alfred] Workspace watcher started (fs.watch)');

// Graceful shutdown — clean up resources on SIGTERM/SIGINT
function gracefulShutdown(signal: string): void {
  console.log(`[alfred] ${signal} received, shutting down gracefully...`);
  smsWatcher.stop();
  mailWatcher.stop();
  watchdog.stop();
  server.close(() => {
    db.close();
    console.log('[alfred] Database closed');
    console.log('[alfred] Server closed');
    process.exit(0);
  });
  // Force exit if server doesn't close within 5s
  setTimeout(() => {
    console.warn('[alfred] Forced shutdown after timeout');
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
