// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFileSync } from 'child_process';
import type { ModuleManifest } from '@opentidy/shared';

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
