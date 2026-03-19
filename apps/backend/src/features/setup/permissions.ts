// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';

const PERMISSIONS = [
  { name: 'messages', label: 'Messages', app: 'Messages', required: false },
  { name: 'mail', label: 'Mail', app: 'Mail', required: false },
  { name: 'calendar', label: 'Calendar', app: 'Calendar', required: false },
  { name: 'contacts', label: 'Contacts', app: 'Contacts', required: false },
  { name: 'finder', label: 'Finder', app: 'Finder', required: false },
  { name: 'system-events', label: 'System Events', app: 'System Events', required: false },
] as const;

const PERMISSION_NAMES = PERMISSIONS.map((p) => p.name);

export function defaultCheckPermission(name: string): boolean {
  const def = PERMISSIONS.find((p) => p.name === name);
  if (!def) return false;
  try {
    execFileSync('osascript', [
      '-e',
      `tell application "System Events" to tell process "${def.app}" to return exists`,
    ], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function defaultGrantPermission(name: string): Promise<boolean> {
  const def = PERMISSIONS.find((p) => p.name === name);
  if (!def) return false;
  try {
    execFileSync('osascript', [
      '-e',
      `tell application "${def.app}" to activate`,
    ], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export interface PermissionsDeps {
  checkPermission: (name: string) => boolean;
  grantPermission?: (name: string) => Promise<boolean>;
}

function buildPermissionList(checkPermission: (name: string) => boolean) {
  return PERMISSIONS.map((p) => ({
    name: p.name,
    label: p.label,
    app: p.app,
    required: p.required,
    granted: checkPermission(p.name),
  }));
}

export function setupPermissionsRoute(deps: PermissionsDeps) {
  const app = new Hono();
  const grantFn = deps.grantPermission ?? defaultGrantPermission;

  app.get('/setup/permissions', (c) => {
    console.log('[setup] GET /setup/permissions');
    return c.json(buildPermissionList(deps.checkPermission));
  });

  app.post('/setup/permissions/grant', async (c) => {
    console.log('[setup] POST /setup/permissions/grant');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const { permission } = body as Record<string, unknown>;
    if (typeof permission !== 'string' || !PERMISSION_NAMES.includes(permission as typeof PERMISSION_NAMES[number])) {
      return c.json({ error: 'Unknown or missing permission' }, 400);
    }
    const granted = await grantFn(permission);
    console.log(`[setup] Grant permission '${permission}': ${granted}`);
    return c.json({ success: true, granted });
  });

  app.post('/setup/permissions/verify', (c) => {
    console.log('[setup] POST /setup/permissions/verify');
    return c.json(buildPermissionList(deps.checkPermission));
  });

  return app;
}
