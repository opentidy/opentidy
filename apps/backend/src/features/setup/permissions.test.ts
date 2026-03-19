// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { setupPermissionsRoute, type PermissionsDeps } from './permissions.js';

function makeDeps(overrides: Partial<PermissionsDeps> = {}): PermissionsDeps {
  return {
    checkPermission: () => false,
    grantPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('GET /setup/permissions', () => {
  it('returns all permissions with granted status', async () => {
    const deps = makeDeps({ checkPermission: (name) => name === 'messages' });
    const app = setupPermissionsRoute(deps);

    const res = await app.request('/setup/permissions');
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const messages = body.find((p: any) => p.name === 'messages');
    expect(messages).toBeDefined();
    expect(messages.granted).toBe(true);
    expect(messages.label).toBeDefined();

    const mail = body.find((p: any) => p.name === 'mail');
    expect(mail.granted).toBe(false);
  });

  it('returns all 6 known permissions', async () => {
    const app = setupPermissionsRoute(makeDeps());
    const res = await app.request('/setup/permissions');
    const body = await res.json() as any;

    const names = body.map((p: any) => p.name);
    expect(names).toContain('messages');
    expect(names).toContain('mail');
    expect(names).toContain('calendar');
    expect(names).toContain('contacts');
    expect(names).toContain('finder');
    expect(names).toContain('system-events');
    expect(names.length).toBe(6);
  });
});

describe('POST /setup/permissions/grant', () => {
  it('calls grantPermission with the given permission name', async () => {
    const grantPermission = vi.fn().mockResolvedValue(true);
    const deps = makeDeps({ grantPermission });
    const app = setupPermissionsRoute(deps);

    const res = await app.request('/setup/permissions/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'messages' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(grantPermission).toHaveBeenCalledWith('messages');
  });

  it('returns 400 for unknown permission', async () => {
    const app = setupPermissionsRoute(makeDeps());
    const res = await app.request('/setup/permissions/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'invalid-perm' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when permission field is missing', async () => {
    const app = setupPermissionsRoute(makeDeps());
    const res = await app.request('/setup/permissions/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /setup/permissions/verify', () => {
  it('re-checks all permissions and returns updated list', async () => {
    const checkPermission = vi.fn().mockReturnValue(true);
    const deps = makeDeps({ checkPermission });
    const app = setupPermissionsRoute(deps);

    const res = await app.request('/setup/permissions/verify', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(6);
    expect(body.every((p: any) => p.granted === true)).toBe(true);
    // checkPermission should have been called once per permission
    expect(checkPermission).toHaveBeenCalledTimes(6);
  });
});
