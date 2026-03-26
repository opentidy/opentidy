// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { MiddlewareHandler } from 'hono';

const PUBLIC_PATHS = ['/api/health', '/api/hooks', '/api/webhooks/'];

export function createAuthMiddleware(bearerToken: string): MiddlewareHandler {
  return async (c, next) => {
    // Skip auth if no token configured (open source mode without Cloudflare)
    if (!bearerToken) return next();

    // Skip auth for public endpoints
    if (PUBLIC_PATHS.some(p => c.req.path.startsWith(p))) return next();

    // Skip auth for same-origin requests (SPA served by this server or via dev proxy)
    // In production, Cloudflare Access protects at the network level
    // In dev mode, Vite proxy forwards from :5173 to :5175 — same localhost, different ports
    const origin = c.req.header('Origin') || '';
    const referer = c.req.header('Referer') || '';
    const host = c.req.header('Host') || '';
    const hostName = host.split(':')[0];
    const originHost = origin.replace(/^https?:\/\//, '').split(':')[0];
    const refererHost = referer.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if ((originHost && originHost === hostName) || (refererHost && refererHost === hostName)) return next();

    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${bearerToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return next();
  };
}