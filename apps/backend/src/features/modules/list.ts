// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleInfo, ModuleManifest, ModuleState } from '@opentidy/shared';
import type { ModuleRouteDeps } from './types.js';
import { runCheckCommand, isModuleConfigured } from './checks.js';

function buildModuleInfo(
  name: string,
  manifest: ModuleManifest,
  state: ModuleState | undefined,
  keychain?: { getPassword(moduleName: string, key: string): string | null },
): ModuleInfo {
  const configFields = manifest.setup?.configFields ?? [];
  const moduleConfig = state?.config ?? {};
  const configured = isModuleConfigured(manifest, moduleConfig, keychain);

  // Check if module deps are actually present on disk
  const checkCommand = manifest.setup?.checkCommand;
  const ready = checkCommand ? runCheckCommand(checkCommand) : undefined;

  return {
    name,
    label: manifest.label,
    description: manifest.description,
    icon: manifest.icon,
    toolPermissions: manifest.toolPermissions,
    core: manifest.core,
    cli: manifest.cli,
    source: state?.source ?? 'curated',
    enabled: state?.enabled ?? false,
    ready,
    platform: manifest.platform,
    health: state?.health,
    healthError: state?.healthError,
    components: {
      mcpServers: (manifest.mcpServers ?? []).map((s) => ({
        name: s.name,
        ...(s.command === 'npx' ? { package: (s.args ?? []).find((a) => !a.startsWith('-')) } : {}),
      })),
      skills: (manifest.skills ?? []).map((s) => ({ name: s.name })),
      receivers: (manifest.receivers ?? []).map((r) => ({ name: r.name, mode: r.mode, source: r.source })),
      ...(manifest.daemon ? {
        daemon: {
          tools: [
            ...(manifest.toolPermissions?.safe ?? []).map(t => t.label),
            ...(manifest.toolPermissions?.critical ?? []).map(t => t.label),
          ],
        },
      } : {}),
    },
    setup: {
      needsAuth: !!manifest.setup?.authCommand,
      authCommand: manifest.setup?.authCommand,
      configFields,
      configured,
    },
  };
}

export function listModulesRoute(deps: ModuleRouteDeps) {
  const app = new Hono();

  app.get('/modules', (c) => {
    console.log('[modules] GET /modules');
    const config = deps.loadConfig();
    const result: ModuleInfo[] = [];

    // Curated modules from manifests
    for (const [name, manifest] of deps.manifests) {
      result.push(buildModuleInfo(name, manifest, config.modules[name], deps.keychain));
    }

    // Custom modules from config that are not in manifests
    for (const [name, state] of Object.entries(config.modules)) {
      if (!deps.manifests.has(name) && state.source === 'custom') {
        // Custom module without a manifest — build minimal info
        result.push({
          name,
          label: name,
          description: '',
          source: 'custom',
          enabled: state.enabled,
          health: state.health,
          healthError: state.healthError,
          components: { mcpServers: [], skills: [], receivers: [] },
        });
      }
    }

    // Core modules first
    result.sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0));
    return c.json({ modules: result });
  });

  return app;
}
