// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import type { ModuleManifest } from '@opentidy/shared';

// Map CLI binary names to Homebrew formula names when they differ
const BREW_FORMULA_MAP: Record<string, string> = {
  bw: 'bitwarden-cli',
  himalaya: 'himalaya',
};

/**
 * Run a module's checkCommand to verify its dependencies are present on disk.
 * Returns true if the command exits 0, false otherwise.
 */
export function runCheckCommand(checkCommand: string): boolean {
  try {
    execFileSync('/bin/sh', ['-c', checkCommand], {
      timeout: 10_000,
      stdio: 'pipe',
      env: { ...process.env, HOME: process.env.HOME ?? '' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install missing CLI dependencies declared in module.json via Homebrew.
 * Returns true if all deps are available after install attempts.
 */
export function installCliDeps(cliDeps: string[]): boolean {
  for (const bin of cliDeps) {
    try {
      execFileSync('/bin/sh', ['-c', `command -v ${bin}`], { timeout: 5_000, stdio: 'pipe' });
    } catch {
      const formula = BREW_FORMULA_MAP[bin] ?? bin;
      console.log(`[modules] Installing CLI dependency: brew install ${formula}`);
      try {
        execFileSync('brew', ['install', formula], { timeout: 120_000, stdio: 'pipe' });
        console.log(`[modules] Installed ${formula}`);
      } catch (err) {
        console.error(`[modules] Failed to install ${formula}:`, (err as Error).message);
        return false;
      }
    }
  }
  return true;
}

/**
 * Check whether all required configFields declared by a manifest are filled
 * in the module's stored config.
 */
export function isModuleConfigured(
  manifest: ModuleManifest,
  moduleConfig: Record<string, unknown>,
  keychain?: { getPassword(moduleName: string, key: string): string | null },
): boolean {
  const requiredFields = (manifest.setup?.configFields ?? []).filter((f) => f.required);
  return (
    requiredFields.length === 0 ||
    requiredFields.every((f) => {
      if (f.storage === 'keychain') {
        // Keychain fields are checked via keychain adapter if available
        return keychain ? !!keychain.getPassword(manifest.name, f.key) : false;
      }
      return moduleConfig[f.key] != null && moduleConfig[f.key] !== '';
    })
  );
}
