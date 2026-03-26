// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { setupPermissionsRoute, type PermissionsDeps } from './permissions.js';

function makeDeps(overrides: Partial<PermissionsDeps> = {}): PermissionsDeps {
  return {
    checkPermission: () => false,
    grantPermission: vi.fn().mockResolvedValue({ opened: true }),
    ...overrides,
  };
}

describe('GET /setup/permissions', () => {
  it('returns all permissions with granted status', async () => {
    const deps = makeDeps({ checkPermission: (name) => name === 'full-disk-access' });
    const app = setupPermissionsRoute(deps);

    const res = await app.request('/setup/permissions');
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(Array.isArray(body.permissions)).toBe(true);
    expect(body.permissions.length).toBeGreaterThan(0);

    const fda = body.permissions.find((p: any) => p.name === 'full-disk-access');
    expect(fda).toBeDefined();
    expect(fda.granted).toBe(true);
    expect(fda.label).toBeDefined();

    const accessibility = body.permissions.find((p: any) => p.name === 'accessibility');
    expect(accessibility.granted).toBe(false);
  });

  it('returns all known permissions', async () => {
    const app = setupPermissionsRoute(makeDeps());
    const res = await app.request('/setup/permissions');
    const body = await res.json() as any;

    const names = body.permissions.map((p: any) => p.name);
    expect(names).toContain('full-disk-access');
    expect(names).toContain('accessibility');
    expect(names.length).toBe(2);
  });
});

describe('POST /setup/permissions/grant', () => {
  it('calls grantPermission with the given permission name', async () => {
    const grantPermission = vi.fn().mockResolvedValue({ opened: true });
    const deps = makeDeps({ grantPermission });
    const app = setupPermissionsRoute(deps);

    const res = await app.request('/setup/permissions/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission: 'full-disk-access' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(grantPermission).toHaveBeenCalledWith('full-disk-access');
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

describe('POST /setup/permissions/recheck', () => {
  it('re-checks all permissions and returns updated list', async () => {
    const checkPermission = vi.fn().mockReturnValue(true);
    const deps = makeDeps({ checkPermission });
    const app = setupPermissionsRoute(deps);

    const res = await app.request('/setup/permissions/recheck', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(body.permissions.length).toBe(2);
    expect(body.permissions.every((p: any) => p.granted === true)).toBe(true);
    expect(checkPermission).toHaveBeenCalledTimes(2);
  });
});
