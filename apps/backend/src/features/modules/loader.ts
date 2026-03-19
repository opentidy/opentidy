// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ModuleManifestSchema } from '@opentidy/shared';
import type { ModuleManifest } from '@opentidy/shared';

export function loadModuleManifest(moduleDir: string): ModuleManifest {
  const manifestPath = join(moduleDir, 'module.json');
  const raw = readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return ModuleManifestSchema.parse(parsed);
}

export function loadCuratedModules(modulesBaseDir: string): Map<string, ModuleManifest> {
  const modules = new Map<string, ModuleManifest>();

  if (!existsSync(modulesBaseDir)) {
    console.warn(`[modules] Modules directory not found: ${modulesBaseDir}`);
    return modules;
  }

  const entries = readdirSync(modulesBaseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const moduleDir = join(modulesBaseDir, entry.name);
    const manifestPath = join(moduleDir, 'module.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = loadModuleManifest(moduleDir);
      // Filter by platform
      if (manifest.platform === 'darwin' && process.platform !== 'darwin') {
        console.log(`[modules] Skipping ${manifest.name} (darwin-only)`);
        continue;
      }
      modules.set(manifest.name, manifest);
      console.log(`[modules] Loaded: ${manifest.name}`);
    } catch (err) {
      console.error(`[modules] Failed to load ${entry.name}:`, (err as Error).message);
    }
  }

  return modules;
}
