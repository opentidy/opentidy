import { existsSync, rmSync, renameSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../config.js';

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

type Scope = 'service' | 'config' | 'data' | 'tunnel';

interface UninstallOptions {
  scopes?: Scope[];
  all?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

interface CleanupItem {
  scope: Scope;
  label: string;
  path?: string;
  action: () => void;
  exists: boolean;
}

// ═══════════════════════════════════════
// Safety
// ═══════════════════════════════════════

function isUnsafeTarget(p: string): boolean {
  const resolved = resolve(p);
  if (!resolved || resolved.trim() === '') return true;
  if (resolved === '/') return true;
  if (resolved === process.env.HOME) return true;
  // Block removing top-level dirs like /Users, /Applications, etc.
  if (resolved.split('/').filter(Boolean).length <= 1) return true;
  return false;
}

function safeDryRemove(label: string, p?: string): void {
  if (p) {
    console.log(`  [dry-run] Would remove: ${label} (${p})`);
  } else {
    console.log(`  [dry-run] Would run: ${label}`);
  }
}

function safeRemove(p: string, label: string, toTrash = false): void {
  if (!existsSync(p)) {
    console.log(`  ·  ${label} — not found, skipping`);
    return;
  }
  if (isUnsafeTarget(p)) {
    console.log(`  ⚠  Refusing to remove unsafe path: ${p}`);
    return;
  }
  if (toTrash) {
    const trashDir = join(process.env.HOME || '', '.Trash');
    const trashName = `${basename(p)}-opentidy-${Date.now()}`;
    try {
      renameSync(p, join(trashDir, trashName));
      console.log(`  ✓  ${label} → moved to Trash`);
    } catch {
      // Fallback to rm if trash move fails (cross-device, etc.)
      rmSync(p, { recursive: true, force: true });
      console.log(`  ✓  ${label} — removed`);
    }
  } else {
    rmSync(p, { recursive: true, force: true });
    console.log(`  ✓  ${label} — removed`);
  }
}

// ═══════════════════════════════════════
// Scope implementations
// ═══════════════════════════════════════

function resolveCleanupItems(): CleanupItem[] {
  const configPath = getConfigPath();
  const config = existsSync(configPath) ? loadConfig(configPath) : null;
  const configDir = dirname(configPath);
  const home = process.env.HOME || '';

  // Resolve workspace dir
  const workspaceDir = config?.workspace.dir
    || process.env.WORKSPACE_DIR
    || resolve(process.cwd(), 'workspace');

  const items: CleanupItem[] = [];

  // --- Service ---
  const plistName = 'com.lolo.assistant.plist';
  const plistPath = join(home, 'Library/LaunchAgents', plistName);
  const brewPlist = join(home, 'Library/LaunchAgents/homebrew.mxcl.opentidy.plist');

  items.push({
    scope: 'service',
    label: 'Stop OpenTidy process',
    exists: true, // always attempt
    action: () => {
      // Try kill any running opentidy/node process on our port
      const port = config?.server.port || 5175;
      try {
        const pid = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8', timeout: 5000 }).trim();
        if (pid) {
          execFileSync('kill', [pid], { timeout: 5000 });
          console.log(`  ✓  Stopped process on port ${port} (PID ${pid})`);
        }
      } catch { /* not running */ }
    },
  });

  items.push({
    scope: 'service',
    label: 'Unload LaunchAgent',
    path: existsSync(plistPath) ? plistPath : existsSync(brewPlist) ? brewPlist : undefined,
    exists: existsSync(plistPath) || existsSync(brewPlist),
    action: () => {
      const uid = process.getuid?.() || 501;
      for (const p of [plistPath, brewPlist]) {
        if (existsSync(p)) {
          try {
            execFileSync('launchctl', ['bootout', `gui/${uid}`, p], { timeout: 10_000, stdio: 'pipe' });
          } catch {
            try { execFileSync('launchctl', ['unload', p], { timeout: 10_000, stdio: 'pipe' }); } catch { /* ignore */ }
          }
          safeRemove(p, `LaunchAgent (${basename(p)})`, true);
        }
      }
    },
  });

  items.push({
    scope: 'service',
    label: 'Remove PID locks',
    path: '/tmp/opentidy-locks',
    exists: existsSync('/tmp/opentidy-locks'),
    action: () => safeRemove('/tmp/opentidy-locks', 'PID locks'),
  });

  // --- Config ---
  items.push({
    scope: 'config',
    label: 'OpenTidy config',
    path: configDir,
    exists: existsSync(configDir),
    action: () => safeRemove(configDir, `Config dir (${configDir})`, true),
  });

  // --- Data ---
  items.push({
    scope: 'data',
    label: 'Workspace (dossiers, SQLite, memory, audit)',
    path: workspaceDir,
    exists: existsSync(workspaceDir),
    action: () => safeRemove(workspaceDir, `Workspace (${workspaceDir})`, true),
  });

  // Log files
  const logPaths = [
    join(home, 'Library/Logs/opentidy-stdout.log'),
    join(home, 'Library/Logs/opentidy-stderr.log'),
    '/opt/homebrew/var/log/opentidy.log',
    '/opt/homebrew/var/log/opentidy-error.log',
  ];
  for (const logPath of logPaths) {
    if (existsSync(logPath)) {
      items.push({
        scope: 'data',
        label: `Log file (${basename(logPath)})`,
        path: logPath,
        exists: true,
        action: () => safeRemove(logPath, basename(logPath)),
      });
    }
  }

  // --- Tunnel ---
  const cfConfigDir = join(home, '.cloudflared');
  items.push({
    scope: 'tunnel',
    label: 'Cloudflare Tunnel service',
    exists: true,
    action: () => {
      try {
        execFileSync('cloudflared', ['service', 'uninstall'], { timeout: 10_000, stdio: 'pipe' });
        console.log('  ✓  Cloudflare Tunnel service uninstalled');
      } catch {
        console.log('  ·  Cloudflare Tunnel service — not installed or already removed');
      }
    },
  });

  items.push({
    scope: 'tunnel',
    label: 'Cloudflare config',
    path: cfConfigDir,
    exists: existsSync(cfConfigDir),
    action: () => safeRemove(cfConfigDir, `Cloudflare config (${cfConfigDir})`, true),
  });

  return items;
}

// ═══════════════════════════════════════
// Interactive multiselect
// ═══════════════════════════════════════

const ALL_SCOPES: { key: Scope; label: string; description: string }[] = [
  { key: 'service', label: 'Service', description: 'Stop process, remove LaunchAgent, PID locks' },
  { key: 'config', label: 'Config', description: '~/.config/opentidy/ (config + Claude Code config)' },
  { key: 'data', label: 'Data', description: 'workspace/ (dossiers, SQLite, memory, logs)' },
  { key: 'tunnel', label: 'Tunnel', description: 'Cloudflare Tunnel service + config' },
];

function showMultiselect(): Promise<Scope[]> {
  return new Promise((resolve) => {
    const selected = new Set<number>([0, 1, 2]); // service, config, data pre-selected
    let cursor = 0;

    const render = () => {
      process.stdout.write('\x1B[2J\x1B[H');
      console.log('');
      console.log('  ╔═══════════════════════════════════════╗');
      console.log('  ║          OpenTidy Uninstall              ║');
      console.log('  ╚═══════════════════════════════════════╝');
      console.log('');
      console.log('  Select what to remove (Space to toggle, Enter to confirm):');
      console.log('');

      for (let i = 0; i < ALL_SCOPES.length; i++) {
        const s = ALL_SCOPES[i];
        const pointer = i === cursor ? '❯' : ' ';
        const check = selected.has(i) ? '✓' : '○';
        console.log(`  ${pointer} ${check}  ${s.label.padEnd(12)} ${s.description}`);
      }

      console.log('');
      console.log('  ─────────────────────────────────────────');
      const pointer5 = cursor === ALL_SCOPES.length ? '❯' : ' ';
      const pointer6 = cursor === ALL_SCOPES.length + 1 ? '❯' : ' ';
      console.log(`  ${pointer5} ▶  Confirm`);
      console.log(`  ${pointer6}    Cancel`);
      console.log('');
    };

    render();

    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Non-interactive fallback — select service + config + data
      resolve(['service', 'config', 'data']);
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    const totalItems = ALL_SCOPES.length + 2; // scopes + confirm + cancel

    const onKey = (key: string) => {
      if (key === '\x1B[A' || key === 'k') {
        cursor = (cursor - 1 + totalItems) % totalItems;
        render();
      } else if (key === '\x1B[B' || key === 'j') {
        cursor = (cursor + 1) % totalItems;
        render();
      } else if (key === ' ' && cursor < ALL_SCOPES.length) {
        // Toggle selection
        if (selected.has(cursor)) selected.delete(cursor);
        else selected.add(cursor);
        render();
      } else if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onKey);
        process.stdout.write('\x1B[2J\x1B[H');

        if (cursor === ALL_SCOPES.length) {
          // Confirm
          resolve([...selected].map(i => ALL_SCOPES[i].key));
        } else if (cursor === ALL_SCOPES.length + 1) {
          // Cancel
          resolve([]);
        } else {
          // Enter on a scope item = toggle + confirm
          if (selected.has(cursor)) selected.delete(cursor);
          else selected.add(cursor);
          resolve([...selected].map(i => ALL_SCOPES[i].key));
        }
      } else if (key === 'q' || key === '\x03') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onKey);
        process.stdout.write('\x1B[2J\x1B[H');
        resolve([]);
      }
    };

    stdin.on('data', onKey);
  });
}

// ═══════════════════════════════════════
// Main
// ═══════════════════════════════════════

export async function runUninstall(args: string[]): Promise<void> {
  const flags = new Set(args);
  const dryRun = flags.has('--dry-run');
  const yes = flags.has('--yes');
  const all = flags.has('--all');

  // Parse explicit scopes from flags
  const explicitScopes: Scope[] = [];
  for (const s of ALL_SCOPES) {
    if (flags.has(`--${s.key}`)) explicitScopes.push(s.key);
  }

  // Determine scopes
  let scopes: Scope[];
  if (all) {
    scopes = ALL_SCOPES.map(s => s.key);
  } else if (explicitScopes.length > 0) {
    scopes = explicitScopes;
  } else {
    // Interactive
    scopes = await showMultiselect();
  }

  if (scopes.length === 0) {
    console.log('  Uninstall cancelled.');
    return;
  }

  // Resolve what to remove
  const items = resolveCleanupItems().filter(item => scopes.includes(item.scope));

  // Show plan
  console.log('');
  console.log('  The following will be removed:');
  console.log('');
  for (const scope of ALL_SCOPES.filter(s => scopes.includes(s.key))) {
    console.log(`  ── ${scope.label} ──`);
    const scopeItems = items.filter(i => i.scope === scope.key);
    for (const item of scopeItems) {
      const status = item.exists ? (item.path || 'action') : 'not found';
      console.log(`     ${item.exists ? '•' : '·'}  ${item.label}${item.path ? ` (${item.path})` : ''}`);
    }
    console.log('');
  }

  // Confirm
  if (!yes) {
    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(r => rl.question('  Proceed with uninstall? (y/N) ', r));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('  Uninstall cancelled.');
      return;
    }
  }

  // Execute
  console.log('');
  if (dryRun) {
    console.log('  [dry-run] No files will be removed.\n');
  }

  for (const item of items) {
    if (dryRun) {
      safeDryRemove(item.label, item.path);
    } else {
      try {
        item.action();
      } catch (err) {
        console.log(`  ⚠  ${item.label} — failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Final message
  console.log('');
  console.log('  ─────────────────────────────────────────');
  console.log('');

  if (scopes.includes('data') && !scopes.includes('config')) {
    console.log('  Tip: Data was removed but config was kept.');
    console.log('  Re-run with --config to also remove config.');
    console.log('');
  }

  if (scopes.includes('config') && !scopes.includes('data')) {
    console.log('  Tip: Config was removed but workspace data was kept.');
    console.log('  Re-run with --data to also remove workspace.');
    console.log('');
  }

  console.log('  OpenTidy source code is still at: ' + process.cwd());
  console.log('  To remove it: rm -rf ' + process.cwd());
  console.log('');
  console.log('  System dependencies (node, tmux, ttyd, etc.) were not removed.');
  console.log('  Remove them manually with: brew uninstall <package>');
  console.log('');
}
