// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { createApp } from './server.js';

describe('createApp', () => {
  it('should return a Hono app', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });
});

describe('GET /api/health', () => {
  it('should return status ok', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
  });

  it('should return JSON content type', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('404 handling', () => {
  it('should return 404 for unknown routes', async () => {
    const app = createApp();
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
  });
});