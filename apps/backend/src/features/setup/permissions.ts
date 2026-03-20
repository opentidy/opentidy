// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';

// Core system permissions required for OpenTidy itself (not module-specific)
// Module-specific permissions (Messages, Mail, etc.) are declared in each module's manifest
const PERMISSIONS = [
  { name: 'full-disk-access', label: 'Full Disk Access', app: '', required: false, description: 'Access files across the system' },
  { name: 'accessibility', label: 'Accessibility', app: '', required: false, description: 'Allow agents to interact with macOS apps' },
] as const;

const PERMISSION_NAMES = PERMISSIONS.map((p) => p.name);

export function defaultCheckPermission(name: string): boolean {
  if (process.platform !== 'darwin') return true;
  try {
    if (name === 'full-disk-access') {
      // Try reading a protected file — fails without FDA
      execFileSync('test', ['-r', '/Library/Application Support/com.apple.TCC/TCC.db'], { timeout: 3000 });
      return true;
    }
    if (name === 'accessibility') {
      // Check via System Events — triggers prompt on first call only
      execFileSync('osascript', ['-e', 'tell application "System Events" to return name of first process'], { timeout: 5000 });
      return true;
    }
    // Module permissions: check via osascript tell app
    execFileSync('osascript', ['-e', `tell application "${name}" to return name`], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function defaultGrantPermission(name: string): Promise<{ opened: boolean }> {
  if (process.platform !== 'darwin') return { opened: false };
  try {
    if (name === 'full-disk-access') {
      execFileSync('open', ['x-apple.systempreferences:com.apple.settings.PrivacySecurity?Privacy_AllFiles'], { timeout: 5000 });
      return { opened: true };
    }
    if (name === 'accessibility') {
      execFileSync('open', ['x-apple.systempreferences:com.apple.settings.PrivacySecurity?Privacy_Accessibility'], { timeout: 5000 });
      return { opened: true };
    }
    // Module permissions: open the app to trigger the permission prompt
    execFileSync('osascript', ['-e', `tell application "${name}" to activate`], { timeout: 5000 });
    return { opened: true };
  } catch {
    return { opened: false };
  }
}

export interface PermissionsDeps {
  checkPermission: (name: string) => boolean;
  grantPermission?: (name: string) => Promise<{ opened: boolean }>;
}

function buildPermissionList(checkPermission: (name: string) => boolean) {
  return PERMISSIONS.map((p) => ({
    name: p.name,
    label: p.label,
    description: p.description,
    required: p.required,
    granted: checkPermission(p.name),
  }));
}

export function setupPermissionsRoute(deps: PermissionsDeps) {
  const app = new Hono();
  const grantFn = deps.grantPermission ?? defaultGrantPermission;

  app.get('/setup/permissions', (c) => {
    console.log('[setup] GET /setup/permissions');
    return c.json({ permissions: buildPermissionList(deps.checkPermission) });
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
    if (typeof permission !== 'string') {
      return c.json({ error: 'Missing permission name' }, 400);
    }
    // Open System Settings or trigger the permission prompt
    const result = await grantFn(permission);
    console.log(`[setup] Grant '${permission}': opened=${result.opened}`);
    return c.json({ success: true, opened: result.opened });
  });

  app.post('/setup/permissions/recheck', (c) => {
    console.log('[setup] POST /setup/permissions/recheck');
    return c.json({ permissions: buildPermissionList(deps.checkPermission) });
  });

  return app;
}
