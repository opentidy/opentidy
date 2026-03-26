// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createInterface } from 'readline';
import { execFileSync } from 'child_process';

let rl: ReturnType<typeof createInterface> | null = null;

function ensureRl(): void {
  // Always recreate. Previous instance may be broken after raw mode.
  if (rl) { try { rl.close(); } catch { /* ignore */ } }
  rl = createInterface({ input: process.stdin, output: process.stdout });
}

export function ask(q: string): Promise<string> {
  ensureRl();
  return new Promise(r => rl!.question(q, r));
}

export function closeRl(): void {
  if (rl) rl.close();
  rl = null;
}

export function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

export function info(text: string): void { console.log(`     ${text}`); }
export function success(text: string): void { console.log(`  ✓  ${text}`); }
export function warn(text: string): void { console.log(`  ⚠  ${text}`); }
