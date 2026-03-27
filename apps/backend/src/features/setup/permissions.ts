// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../../shared/config.js';

// Core system permissions required for OpenTidy itself (not module-specific)
// Module-specific permissions (Messages, Mail, etc.) are declared in each module's manifest
const PERMISSIONS = [
  { name: 'full-disk-access', label: 'Full Disk Access', app: '', required: true, description: 'Required for agents to access files on your system' },
  { name: 'accessibility', label: 'Accessibility', app: '', required: true, description: 'Required for agents to interact with macOS apps' },
] as const;

const KNOWN_TERMINALS = [
  'com.googlecode.iterm2',
  'com.apple.Terminal',
  'dev.warp.Warp-Stable',
  'com.github.nicklockwood.Console',
  'co.zeit.hyper',
  'com.mitchellh.ghostty',
];

const TCC_SERVICES: Record<string, string> = {
  'full-disk-access': 'kTCCServiceSystemPolicyAllFiles',
  accessibility: 'kTCCServiceAccessibility',
};

function checkTccForTerminal(service: string): boolean {
  try {
    const result = execFileSync('sqlite3', [
      '/Library/Application Support/com.apple.TCC/TCC.db',
      `SELECT client FROM access WHERE service='${service}' AND auth_value=2;`,
    ], { timeout: 3000, encoding: 'utf-8' });
    return KNOWN_TERMINALS.some((t) => result.includes(t));
  } catch {
    return false;
  }
}

// Fallback for Accessibility check when TCC.db is unreadable (no FDA).
// Uses the native AXIsProcessTrusted() API which checks the responsible app
// (the terminal that spawned this process) without needing FDA.
function checkAccessibilityViaAPI(): boolean {
  try {
    const result = execFileSync('osascript', [
      '-l', 'JavaScript',
      '-e', 'ObjC.import("ApplicationServices"); $.AXIsProcessTrusted()',
    ], { timeout: 3000, encoding: 'utf-8' });
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

export function defaultCheckPermission(name: string): boolean {
  if (process.platform !== 'darwin') return true;

  // Runtime check: works when running from a terminal with the right permissions
  if (name === 'full-disk-access') {
    try {
      execFileSync('test', ['-r', '/Library/Application Support/com.apple.TCC/TCC.db'], { timeout: 3000 });
      return true;
    } catch { /* fall through to config */ }
  } else if (name === 'accessibility') {
    // Try TCC database query (needs FDA), then native API fallback
    const service = TCC_SERVICES[name];
    if (service && checkTccForTerminal(service)) return true;
    if (checkAccessibilityViaAPI()) return true;
  }

  // Fallback: read from config (set by `opentidy doctor --check-permissions` from terminal)
  try {
    const config = loadConfig(getConfigPath());
    const sp = config.systemPermissions;
    if (sp) {
      if (name === 'full-disk-access') return sp.fullDiskAccess;
      if (name === 'accessibility') return sp.accessibility;
    }
  } catch { /* ignore */ }

  return false;
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
    // Check actual status. May trigger a one-time macOS popup for Accessibility,
    // which is fine since we want the user to authorize it anyway.
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
