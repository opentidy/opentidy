// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createAuthMiddleware } from './auth.js';

describe('auth middleware', () => {
  it('allows requests with valid bearer token', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests with invalid token', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer wrong-token', Host: 'localhost:7750' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with no token', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test', {
      headers: { Host: 'localhost:7750' },
    });
    expect(res.status).toBe(401);
  });

  it('skips auth when no token configured (open source mode)', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware(''));
    app.get('/api/test', (c) => c.json({ ok: true }));

    const res = await app.request('/api/test');
    expect(res.status).toBe(200);
  });

  it('always allows /api/health without auth', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.get('/api/health', (c) => c.json({ status: 'ok' }));

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('always allows /api/hooks without auth', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.post('/api/hooks', (c) => c.json({ ok: true }));

    const res = await app.request('/api/hooks', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('always allows /api/webhooks/* without auth', async () => {
    const app = new Hono();
    app.use('/api/*', createAuthMiddleware('secret-token'));
    app.post('/api/webhooks/email/email-imap', (c) => c.json({ ok: true }));

    const res = await app.request('/api/webhooks/email/email-imap', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});