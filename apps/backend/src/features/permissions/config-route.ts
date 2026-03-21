// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { PermissionConfigSchema } from '@opentidy/shared';
import type { PermissionConfig, PermissionPreset, PermissionLevel, ModuleManifest } from '@opentidy/shared';

const PRESET_DEFAULTS: Record<PermissionPreset, PermissionLevel> = {
  'supervised': 'ask',
  'autonomous': 'confirm',
  'full-auto': 'allow',
};

interface ConfigRouteDeps {
  loadConfig: () => { permissions: PermissionConfig };
  saveConfig: (update: (config: Record<string, unknown>) => void) => void;
  manifests: Map<string, ModuleManifest>;
  regenerateHooks?: () => void;
}

export function permissionConfigRoute(deps: ConfigRouteDeps) {
  const router = new Hono();

  router.get('/permissions/config', (c) => {
    const config = deps.loadConfig();
    const modules = Array.from(deps.manifests.values())
      .filter(m => m.toolPermissions)
      .map(m => ({
        name: m.name,
        label: m.label,
        icon: m.icon,
        toolPermissions: m.toolPermissions,
      }));
    return c.json({ permissions: config.permissions, modules });
  });

  router.put('/permissions/config', async (c) => {
    const body = await c.req.json();
    const parsed = PermissionConfigSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    deps.saveConfig((cfg: Record<string, unknown>) => {
      cfg.permissions = parsed.data;
    });
    deps.regenerateHooks?.();
    return c.json({ ok: true });
  });

  router.post('/permissions/preset', async (c) => {
    const { preset } = await c.req.json() as { preset: PermissionPreset };
    const defaultLevel = PRESET_DEFAULTS[preset];
    if (!defaultLevel) return c.json({ error: 'invalid preset' }, 400);

    const modules: Record<string, PermissionLevel> = {};
    for (const [, manifest] of deps.manifests) {
      if (manifest.toolPermissions) {
        modules[manifest.name] = defaultLevel;
      }
    }

    deps.saveConfig((cfg: Record<string, unknown>) => {
      cfg.permissions = { preset, defaultLevel, modules };
    });
    deps.regenerateHooks?.();

    return c.json({ ok: true, permissions: { preset, defaultLevel, modules } });
  });

  return router;
}
