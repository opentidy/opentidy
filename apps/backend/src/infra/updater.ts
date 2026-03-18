import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

export function isNewerVersion(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(h|m|d)$/);
  if (!match) return 6 * 60 * 60 * 1000;
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

interface UpdaterDeps {
  currentVersion: string;
  repoOwner: string;
  repoName: string;
  checkInterval: string;
  autoUpdate: boolean;
  notifyBeforeUpdate: boolean;
  delayBeforeUpdate: string;
  sendTelegram: (text: string) => Promise<void>;
  updaterScriptPath: string;
  telegramBotToken: string;
  telegramChatId: string;
}

export function createUpdater(deps: UpdaterDeps) {
  let timer: NodeJS.Timeout | null = null;

  async function checkForUpdate(): Promise<{ available: boolean; version?: string }> {
    try {
      const res = await fetch(`https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/releases/latest`);
      if (!res.ok) return { available: false };
      const data = await res.json() as { tag_name: string };
      const latest = data.tag_name.replace(/^v/, '');
      if (isNewerVersion(deps.currentVersion, latest)) {
        return { available: true, version: latest };
      }
      return { available: false };
    } catch (err) {
      console.error('[updater] Check failed:', err);
      return { available: false };
    }
  }

  function spawnDetachedUpdater(newVersion: string): void {
    const cacheDir = `${process.env.HOME}/.cache/opentidy/releases`;
    mkdirSync(cacheDir, { recursive: true });

    const child = spawn('bash', [deps.updaterScriptPath], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        BOT_TOKEN: deps.telegramBotToken,
        CHAT_ID: deps.telegramChatId,
        NEW_VERSION: newVersion,
        PREV_VERSION: deps.currentVersion,
      },
    });
    child.unref();
    console.log(`[updater] Detached updater spawned (PID ${child.pid}) for v${newVersion}`);
  }

  async function tick(): Promise<void> {
    const { available, version } = await checkForUpdate();
    if (!available || !version) return;

    console.log(`[updater] New version available: v${version}`);

    if (deps.notifyBeforeUpdate) {
      await deps.sendTelegram(`OpenTidy v${version} disponible. Mise a jour auto dans ${deps.delayBeforeUpdate}.`);
    }

    if (deps.autoUpdate) {
      const delayMs = parseInterval(deps.delayBeforeUpdate);
      setTimeout(() => spawnDetachedUpdater(version), delayMs);
    }
  }

  function start(): void {
    const intervalMs = parseInterval(deps.checkInterval);
    console.log(`[updater] Checking every ${deps.checkInterval}`);
    timer = setInterval(tick, intervalMs);
    // Check on startup after 30s delay
    setTimeout(tick, 30_000);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
  }

  return { start, stop, checkForUpdate, spawnDetachedUpdater };
}
