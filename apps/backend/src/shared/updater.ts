// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';

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
  sendTelegram: (text: string) => Promise<void>;
}

export function createUpdater(deps: UpdaterDeps) {
  let timer: NodeJS.Timeout | null = null;

  async function checkForUpdate(): Promise<{ available: boolean; version?: string }> {
    try {
      const res = await fetch(`https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/releases/latest`);
      if (!res.ok) return { available: false };
      const data = await res.json() as { tag_name: string };
      const latest = data.tag_name.replace(/^(opentidy-)?v/, '');
      if (isNewerVersion(deps.currentVersion, latest)) {
        return { available: true, version: latest };
      }
      return { available: false };
    } catch (err) {
      console.error('[updater] Check failed:', err);
      return { available: false };
    }
  }

  async function tick(): Promise<void> {
    const { available, version } = await checkForUpdate();
    if (!available || !version) return;

    console.log(`[updater] New version available: v${version}`);

    // Notify user — they update via `brew upgrade opentidy` or `opentidy update`
    await deps.sendTelegram(`OpenTidy v${version} disponible. Mets à jour avec: opentidy update`);

    // Auto-update via brew if enabled
    if (deps.autoUpdate) {
      console.log('[updater] Auto-updating via brew...');
      try {
        execFileSync('brew', ['upgrade', 'opentidy'], { timeout: 300_000, stdio: 'pipe' });
        execFileSync('brew', ['services', 'restart', 'opentidy'], { timeout: 30_000, stdio: 'pipe' });
        console.log(`[updater] Updated to v${version}`);
        await deps.sendTelegram(`OpenTidy v${version} installé et redémarré.`);
      } catch (err) {
        console.error('[updater] Auto-update failed:', (err as Error).message);
        await deps.sendTelegram(`Mise à jour auto échouée. Lance manuellement: opentidy update`);
      }
    }
  }

  function start(): void {
    const intervalMs = parseInterval(deps.checkInterval);
    console.log(`[updater] Checking every ${deps.checkInterval}`);
    timer = setInterval(tick, intervalMs);
    setTimeout(tick, 30_000);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
  }

  return { start, stop, checkForUpdate };
}
