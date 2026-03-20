// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { ModuleInfo, ModuleManifest, ModuleState } from '@opentidy/shared';
import type { ModuleRouteDeps } from './types.js';

function buildModuleInfo(
  name: string,
  manifest: ModuleManifest,
  state: ModuleState | undefined,
): ModuleInfo {
  const configFields = manifest.setup?.configFields ?? [];
  const requiredFields = configFields.filter((f) => f.required);
  const moduleConfig = state?.config ?? {};
  const configured = requiredFields.length === 0 ||
    requiredFields.every((f) => moduleConfig[f.key] != null && moduleConfig[f.key] !== '');

  return {
    name,
    label: manifest.label,
    description: manifest.description,
    icon: manifest.icon,
    core: manifest.core,
    source: state?.source ?? 'curated',
    enabled: state?.enabled ?? false,
    platform: manifest.platform,
    health: state?.health,
    healthError: state?.healthError,
    components: {
      mcpServers: (manifest.mcpServers ?? []).map((s) => s.name),
      skills: (manifest.skills ?? []).map((s) => s.name),
      receivers: (manifest.receivers ?? []).map((r) => r.name),
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
      result.push(buildModuleInfo(name, manifest, config.modules[name]));
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
