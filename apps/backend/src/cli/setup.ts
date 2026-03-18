import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { createInterface } from 'readline';
import { execFileSync } from 'child_process';
import { loadConfig, saveConfig, getConfigPath } from '../config.js';
import { randomBytes } from 'crypto';

let rl: ReturnType<typeof createInterface>;
function ensureRl() {
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout });
}
const ask = (q: string): Promise<string> => {
  ensureRl();
  return new Promise(r => rl.question(q, r));
};

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function info(text: string): void { console.log(`     ${text}`); }
function success(text: string): void { console.log(`  ✓  ${text}`); }
function warn(text: string): void { console.log(`  ⚠  ${text}`); }

function _copyClaudeConfigTemplate(templateDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const file of ['settings.json', 'CLAUDE.md']) {
    const src = join(templateDir, file);
    const dst = join(targetDir, file);
    if (existsSync(src)) {
      copyFileSync(src, dst);
    }
  }
  const localSettings = join(targetDir, 'settings.local.json');
  if (!existsSync(localSettings)) {
    writeFileSync(localSettings, '{}\n');
  }
}

// ═══════════════════════════════════════
// Status checks — detect what's already configured
// ═══════════════════════════════════════

interface ModuleStatus {
  name: string;
  key: string;
  done: boolean;
  detail: string;
}

function checkPermissions(): { done: boolean; detail: string } {
  const apps = ['Messages', 'Mail', 'Finder', 'System Events', 'Calendar', 'Contacts'];
  const results: string[] = [];
  let allOk = true;
  for (const app of apps) {
    try {
      execFileSync('osascript', ['-e', `tell application "${app}" to get name`], {
        encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
      });
      results.push(app);
    } catch {
      allOk = false;
    }
  }
  if (allOk) return { done: true, detail: `${apps.length}/${apps.length} apps authorized` };
  if (results.length > 0) return { done: false, detail: `${results.length}/${apps.length} apps authorized` };
  return { done: false, detail: 'Not configured' };
}

function getModuleStatuses(): ModuleStatus[] {
  const configPath = getConfigPath();
  const config = existsSync(configPath) ? loadConfig(configPath) : null;

  return [
    {
      name: 'Telegram',
      key: 'telegram',
      done: !!(config?.telegram.botToken && config?.telegram.chatId),
      detail: config?.telegram.botToken ? `Bot: ...${config.telegram.botToken.slice(-8)}` : 'Not configured',
    },
    {
      name: 'API Auth',
      key: 'auth',
      done: !!(config?.auth.bearerToken),
      detail: config?.auth.bearerToken ? `Token: ...${config.auth.bearerToken.slice(-8)}` : 'Not configured',
    },
    {
      name: 'Claude Code',
      key: 'claude',
      done: !!(config?.claudeConfig.dir && existsSync(join(config.claudeConfig.dir, 'settings.json'))),
      detail: config?.claudeConfig.dir ? config.claudeConfig.dir : 'Not configured',
    },
    {
      name: 'Cloudflare Tunnel',
      key: 'cloudflare',
      done: existsSync(`${process.env.HOME}/.cloudflared/config.yml`),
      detail: existsSync(`${process.env.HOME}/.cloudflared/config.yml`) ? 'Config exists' : 'Not configured',
    },
    {
      name: 'macOS Permissions',
      key: 'permissions',
      ...checkPermissions(),
    },
  ];
}


// ═══════════════════════════════════════
// Individual module setup functions
// ═══════════════════════════════════════

async function setupTelegram(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Telegram Notifications              │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy sends you notifications via Telegram.');
  info('You need a bot and a chat/group to send to.');
  console.log('');

  if (config.telegram.botToken) {
    info(`Current bot token: ...${config.telegram.botToken.slice(-8)}`);
    const keep = await ask('  Keep current token? (Y/n) ');
    if (keep.toLowerCase() !== 'n') {
      if (config.telegram.chatId) {
        info(`Current chat ID: ${config.telegram.chatId}`);
        const keepChat = await ask('  Keep current chat ID? (Y/n) ');
        if (keepChat.toLowerCase() !== 'n') {
          success('Telegram config unchanged.');
          return;
        }
      }
      const chatId = await ask('  Chat ID: ');
      config.telegram.chatId = chatId;
      saveConfig(configPath, config);
      success('Chat ID updated.');
      return;
    }
  }

  info('How to create a Telegram bot:');
  info('  1. Open Telegram, search for @BotFather');
  info('  2. Send /newbot, follow the prompts');
  info('  3. Copy the token (looks like 123456:AABB...)');
  console.log('');
  const botToken = await ask('  Bot token: ');

  console.log('');
  info('How to find your Chat ID:');
  info('  1. Add the bot to a group (or message it directly)');
  info(`  2. Open: https://api.telegram.org/bot${botToken}/getUpdates`);
  info('  3. Send a message, refresh the page');
  info('  4. Find "chat":{"id": NUMBER } in the response');
  info('  Tip: Group IDs start with - (e.g. -1001234567890)');
  console.log('');
  const chatId = await ask('  Chat ID: ');

  config.telegram.botToken = botToken;
  config.telegram.chatId = chatId;
  saveConfig(configPath, config);
  success('Telegram configured.');
}

async function setupAuth(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  API Authentication                  │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy has an HTTP API. A bearer token protects it');
  info('so only you (and your web app) can access it.');
  console.log('');

  if (config.auth.bearerToken) {
    info(`Current token: ...${config.auth.bearerToken.slice(-8)}`);
    const keep = await ask('  Keep current token? (Y/n) ');
    if (keep.toLowerCase() !== 'n') {
      success('Auth config unchanged.');

      // Still check port
      info(`Current port: ${config.server.port}`);
      const keepPort = await ask('  Keep current port? (Y/n) ');
      if (keepPort.toLowerCase() !== 'n') return;
    }
  }

  info('Press Enter to auto-generate a secure 64-char token,');
  info('or paste your own.');
  console.log('');
  const defaultToken = randomBytes(32).toString('hex');
  const bearerInput = await ask('  Bearer token (Enter = auto-generate): ');
  const bearerToken = bearerInput || defaultToken;
  if (!bearerInput) {
    console.log('');
    success(`Generated: ${bearerToken}`);
    warn('Save this token! You need it for the web app.');
  }

  console.log('');
  info(`Current port: ${config.server.port || 5175}`);
  const portStr = await ask('  Port (Enter = keep current): ');
  const port = parseInt(portStr) || config.server.port || 5175;

  config.auth.bearerToken = bearerToken;
  config.server.port = port;
  saveConfig(configPath, config);
  success('Auth configured.');
}

async function setupClaude(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Claude Code                         │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy runs Claude Code sessions autonomously.');
  info('It uses an isolated config (separate from yours).');
  console.log('');

  // Copy config template
  const templateDir = resolve(import.meta.dirname, '../../config/claude');
  const claudeConfigDir = resolve(dirname(configPath), 'claude-config');

  if (existsSync(join(claudeConfigDir, 'settings.json'))) {
    info(`Config already exists at: ${claudeConfigDir}`);
    const recopy = await ask('  Re-copy template? (keeps settings.local.json) (y/N) ');
    if (recopy.toLowerCase() === 'y') {
      _copyClaudeConfigTemplate(templateDir, claudeConfigDir);
      success('Template re-copied.');
    }
  } else {
    _copyClaudeConfigTemplate(templateDir, claudeConfigDir);
    success(`Config template copied to ${claudeConfigDir}`);
  }

  config.claudeConfig.dir = claudeConfigDir;
  saveConfig(configPath, config);

  // Auth
  console.log('');
  info('Claude Code needs to be authenticated (OAuth).');
  info('This opens a browser — log in with your Claude account.');
  console.log('');
  await ask('  Press Enter to open the browser...');

  try {
    execFileSync('claude', ['auth', 'login'], {
      stdio: 'inherit',
      timeout: 120_000,
      env: { ...process.env, CLAUDE_CONFIG_DIR: claudeConfigDir },
    });
    console.log('');
    success('Claude Code authenticated.');
  } catch {
    console.log('');
    warn('Authentication failed or skipped.');
    info(`Run manually: CLAUDE_CONFIG_DIR="${claudeConfigDir}" claude auth login`);
  }
}

async function setupCloudflare(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const port = config.server.port || 5175;

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Cloudflare Tunnel                   │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('A Cloudflare Tunnel lets you access OpenTidy from anywhere');
  info('without opening ports on your router. Free, secure, fast.');
  console.log('');
  info('Prerequisites:');
  info('  - A free Cloudflare account');
  info('  - A domain added to Cloudflare (e.g. yourdomain.com)');
  info('  - cloudflared installed (brew install cloudflared)');
  console.log('');

  if (!run('cloudflared', ['--version'])) {
    warn('cloudflared not found. Install it: brew install cloudflared');
    return;
  }

  // --- Step A: Login ---
  if (!existsSync(`${process.env.HOME}/.cloudflared/cert.pem`)) {
    console.log('  Step A: Login to Cloudflare');
    console.log('');
    info('A browser will open with your Cloudflare domains.');
    info('');
    info('  ┌──────────────────────────────────────────────────┐');
    info('  │  SELECT THE DOMAIN you want for OpenTidy.          │');
    info('  │  Example: if you want opentidy.yourdomain.com,         │');
    info('  │  click on "yourdomain.com" in the list.              │');
    info('  └──────────────────────────────────────────────────┘');
    info('');
    await ask('  Press Enter to open the browser...');
    try {
      execFileSync('cloudflared', ['tunnel', 'login'], { stdio: 'inherit', timeout: 120_000 });
      console.log('');
      success('Logged into Cloudflare.');
    } catch {
      warn('Login failed. Run manually: cloudflared tunnel login');
      return;
    }
  } else {
    success('Already logged into Cloudflare.');
  }

  // --- Step B: Create tunnel ---
  console.log('');
  console.log('  Step B: Create a tunnel');
  info('A tunnel is a persistent secure connection to Cloudflare.');
  console.log('');
  const tunnelName = await ask('  Tunnel name (Enter = "opentidy"): ') || 'opentidy';

  const existingTunnels = run('cloudflared', ['tunnel', 'list', '--output', 'json']);
  const tunnelExists = existingTunnels.includes(`"${tunnelName}"`);

  if (!tunnelExists) {
    info(`Creating tunnel "${tunnelName}"...`);
    try {
      execFileSync('cloudflared', ['tunnel', 'create', tunnelName], { stdio: 'inherit', timeout: 30_000 });
      success(`Tunnel "${tunnelName}" created.`);
    } catch {
      warn(`Failed. Run manually: cloudflared tunnel create ${tunnelName}`);
    }
  } else {
    success(`Tunnel "${tunnelName}" already exists.`);
  }

  // --- Step C: DNS ---
  console.log('');
  console.log('  Step C: DNS route');
  info('Choose the hostname people will use to reach OpenTidy.');
  info('This must be a subdomain of the domain you selected');
  info('during login (e.g. opentidy.yourdomain.com).');
  console.log('');
  const hostname = await ask('  Hostname (e.g. opentidy.yourdomain.com): ');
  if (hostname) {
    info(`Creating DNS route: ${hostname} → tunnel "${tunnelName}"...`);
    try {
      execFileSync('cloudflared', ['tunnel', 'route', 'dns', tunnelName, hostname], { stdio: 'inherit', timeout: 30_000 });
      success(`${hostname} is now routed to the tunnel.`);
    } catch {
      warn('Failed. Add a CNAME record manually in Cloudflare DNS:');
      info(`  ${hostname} → ${tunnelName}.cfargotunnel.com`);
    }
  }

  // --- Step D: Config file ---
  console.log('');
  const cfConfigDir = `${process.env.HOME}/.cloudflared`;
  mkdirSync(cfConfigDir, { recursive: true });
  const cfConfigPath = join(cfConfigDir, 'config.yml');

  if (existsSync(cfConfigPath)) {
    info(`Config already exists: ${cfConfigPath}`);
    const overwrite = await ask('  Overwrite? (y/N) ');
    if (overwrite.toLowerCase() !== 'y') {
      success('Keeping existing config.');
    } else {
      writeCloudflaredConfig(cfConfigPath, cfConfigDir, tunnelName, hostname, port);
    }
  } else {
    writeCloudflaredConfig(cfConfigPath, cfConfigDir, tunnelName, hostname, port);
  }

  // --- Step E: Service ---
  console.log('');
  console.log('  Step D: Background service');
  info('Install cloudflared as a launchd service so the tunnel');
  info('runs automatically on boot (even without logging in).');
  console.log('');
  const installService = await ask('  Install as background service? (Y/n) ');
  if (installService.toLowerCase() !== 'n') {
    try {
      execFileSync('cloudflared', ['service', 'install'], { stdio: 'inherit', timeout: 30_000 });
      success('Tunnel service installed (starts on boot).');
    } catch {
      warn('Failed. Run manually: cloudflared service install');
    }
  }
}

function writeCloudflaredConfig(cfConfigPath: string, cfConfigDir: string, tunnelName: string, hostname: string, port: number): void {
  const cfConfig = `tunnel: ${tunnelName}
credentials-file: ${cfConfigDir}/${tunnelName}.json

ingress:
  - hostname: ${hostname || 'opentidy.example.com'}
    service: http://localhost:${port}
  - service: http_status:404
`;
  writeFileSync(cfConfigPath, cfConfig);
  success(`Config written to ${cfConfigPath}`);
}

async function setupPermissions(): Promise<void> {
  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  macOS Permissions                   │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy uses AppleScript to control Messages, Mail,');
  info('Finder, Calendar, etc. macOS will ask for permission');
  info('the first time each app is accessed.');
  console.log('');
  info('We will trigger each permission now. For each one,');
  info('a macOS popup will appear — click "OK" or "Allow".');
  console.log('');
  await ask('  Press Enter to start...');

  const permissionTests = [
    { name: 'Messages (SMS)', script: 'tell application "Messages" to get name' },
    { name: 'Mail', script: 'tell application "Mail" to get name' },
    { name: 'Finder', script: 'tell application "Finder" to get name of startup disk' },
    { name: 'System Events', script: 'tell application "System Events" to get name' },
    { name: 'Calendar', script: 'tell application "Calendar" to get name' },
    { name: 'Contacts', script: 'tell application "Contacts" to get name' },
  ];

  for (const test of permissionTests) {
    console.log(`\n  Testing ${test.name}...`);
    info('If a macOS popup appears, click "OK" / "Allow".');
    try {
      execFileSync('osascript', ['-e', test.script], {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
      });
      success(`${test.name} — authorized`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('not allowed') || msg.includes('denied') || msg.includes('-1743')) {
        warn(`${test.name} — denied. Enable it in:`);
        info('  System Settings > Privacy & Security > Automation');
      } else {
        success(`${test.name} — done`);
      }
    }
  }

  // Full Disk Access — can't trigger via osascript
  console.log('');
  console.log('  ── Full Disk Access ──');
  info('This one can\'t be triggered automatically.');
  info('Needed for reading Mail databases and protected files.');
  console.log('');
  info('What to do:');
  info('  1. System Settings > Privacy & Security > Full Disk Access');
  info('  2. Click +');
  info('  3. Add the terminal you use (Terminal.app or iTerm)');
  info('  4. If OpenTidy runs via launchd, also add /opt/homebrew/bin/node');
  console.log('');
  const openFda = await ask('  Open Full Disk Access settings? (Y/n) ');
  if (openFda.toLowerCase() !== 'n') {
    try {
      execFileSync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'], { timeout: 5000 });
    } catch { /* ignore */ }
    await ask('  Press Enter when done...');
  }

  console.log('');
  success('Permissions setup complete.');
}

// ═══════════════════════════════════════
// Module map
// ═══════════════════════════════════════

const MODULES: Record<string, () => Promise<void>> = {
  telegram: setupTelegram,
  auth: setupAuth,
  claude: setupClaude,
  cloudflare: setupCloudflare,
  permissions: setupPermissions,
};

const MODULE_ORDER = ['telegram', 'auth', 'claude', 'cloudflare', 'permissions'];

// ═══════════════════════════════════════
// Exported functions
// ═══════════════════════════════════════

export function copyClaudeConfigTemplate(templateDir: string, targetDir: string): void {
  _copyClaudeConfigTemplate(templateDir, targetDir);
}

export function createConfigFile(configPath: string, opts: {
  telegramBotToken: string;
  telegramChatId: string;
  bearerToken: string;
  port: number;
}): void {
  const config = loadConfig(configPath);
  config.telegram.botToken = opts.telegramBotToken;
  config.telegram.chatId = opts.telegramChatId;
  config.auth.bearerToken = opts.bearerToken;
  config.server.port = opts.port;
  saveConfig(configPath, config);
}

// ═══════════════════════════════════════
// Interactive menu (arrow keys + enter)
// ═══════════════════════════════════════

interface MenuItem {
  label: string;
  key: string;
  icon: string;
  detail: string;
}

function showInteractiveMenu(): Promise<string> {
  return new Promise((resolve) => {
    const statuses = getModuleStatuses();
    const missing = statuses.filter(s => !s.done);

    const items: MenuItem[] = statuses.map(s => ({
      label: s.name,
      key: s.key,
      icon: s.done ? '✓' : '○',
      detail: s.detail,
    }));

    // Add action items at the bottom
    if (missing.length > 0) {
      items.push({ label: `Setup all missing (${missing.length})`, key: '_missing', icon: '▶', detail: '' });
    }
    items.push({ label: 'Setup everything', key: '_all', icon: '▶', detail: '' });
    items.push({ label: 'Exit', key: '_exit', icon: ' ', detail: '' });

    let cursor = missing.length > 0 ? items.length - 3 : items.length - 2; // default to "Setup missing" or "Setup everything"

    const render = () => {
      // Clear screen and move to top
      process.stdout.write('\x1B[2J\x1B[H');
      console.log('');
      console.log('  ╔═══════════════════════════════════════╗');
      console.log('  ║          OpenTidy Setup                  ║');
      console.log('  ╚═══════════════════════════════════════╝');
      console.log('');
      console.log('  Use ↑↓ arrows to navigate, Enter to select.');
      console.log('');

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const selected = i === cursor;
        const pointer = selected ? '❯' : ' ';
        const dim = selected ? '' : '';

        // Separator before action items
        if (i === statuses.length && i > 0) {
          console.log('  ─────────────────────────────────────────');
        }

        if (item.detail) {
          console.log(`  ${pointer} ${item.icon}  ${item.label.padEnd(22)} ${item.detail}`);
        } else {
          console.log(`  ${pointer} ${item.icon}  ${item.label}`);
        }
      }
      console.log('');
    };

    render();

    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Not a real terminal — fallback to text prompt
      resolve('_missing');
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    const onKey = (key: string) => {
      // Up arrow: \x1B[A
      if (key === '\x1B[A' || key === 'k') {
        cursor = (cursor - 1 + items.length) % items.length;
        render();
      }
      // Down arrow: \x1B[B
      else if (key === '\x1B[B' || key === 'j') {
        cursor = (cursor + 1) % items.length;
        render();
      }
      // Enter
      else if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onKey);
        // Clear the menu
        process.stdout.write('\x1B[2J\x1B[H');
        resolve(items[cursor].key);
      }
      // q or Ctrl+C
      else if (key === 'q' || key === '\x03') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onKey);
        process.stdout.write('\x1B[2J\x1B[H');
        resolve('_exit');
      }
    };

    stdin.on('data', onKey);
  });
}

export async function runSetup(moduleArg?: string): Promise<void> {
  // Ensure base config file exists
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    saveConfig(configPath, loadConfig(configPath));
  }

  // Direct module from CLI arg: tidy setup telegram
  if (moduleArg && moduleArg !== '--all') {
    const fn = MODULES[moduleArg];
    if (!fn) {
      console.log(`  Unknown module: ${moduleArg}`);
      console.log(`  Available: ${MODULE_ORDER.join(', ')}`);
      return;
    }
    await fn();
    if (rl) rl.close();
    return;
  }

  // --all flag: run everything sequentially
  if (moduleArg === '--all') {
    for (const key of MODULE_ORDER) {
      await MODULES[key]();
    }
    printSummary(configPath);
    if (rl) rl.close();
    return;
  }

  // Interactive menu loop
  while (true) {
    const choice = await showInteractiveMenu();

    if (choice === '_exit') {
      break;
    }

    if (choice === '_missing') {
      const statuses = getModuleStatuses();
      const missing = statuses.filter(s => !s.done);
      for (const mod of missing) {
        await MODULES[mod.key]();
      }
      printSummary(configPath);
      // Show menu again after completion
      await ask('\n  Press Enter to return to menu...');
      continue;
    }

    if (choice === '_all') {
      for (const key of MODULE_ORDER) {
        await MODULES[key]();
      }
      printSummary(configPath);
      await ask('\n  Press Enter to return to menu...');
      continue;
    }

    // Individual module
    const fn = MODULES[choice];
    if (fn) {
      await fn();
      await ask('\n  Press Enter to return to menu...');
    }
  }

  if (rl) rl.close();
}

function printSummary(configPath: string): void {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║          Setup Complete!               ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  const config = loadConfig(configPath);
  if (config.auth.bearerToken) {
    console.log(`  API Token: ${config.auth.bearerToken}`);
    console.log('');
  }

  console.log('  Start: tidy start');
  console.log('  Check: tidy doctor');
}
