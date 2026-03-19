// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import type { McpDeps } from './list.js';

const SMITHERY_BASE = 'https://registry.smithery.ai';
const CACHE_TTL_MS = 3_600_000; // 1 hour

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

async function fetchWithCache(cacheKey: string, url: string): Promise<unknown> {
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Registry returned ${res.status}`);

    const data = await res.json();
    cache.set(cacheKey, { data, timestamp: now });
    return data;
  } catch (err) {
    if (cached) {
      console.warn(`[mcp-registry] Registry unreachable, serving stale cache for "${cacheKey}"`);
      return cached.data;
    }
    throw err;
  }
}

export function registrySearchRoute(_deps: McpDeps) {
  const app = new Hono();

  // Search or browse — returns Smithery servers with useCount, iconUrl, verified
  app.get('/mcp/registry/search', async (c) => {
    const q = c.req.query('q') || '';
    const page = c.req.query('page') || '1';
    const pageSize = c.req.query('pageSize') || '20';

    const params = new URLSearchParams({
      q,
      page,
      pageSize,
    });

    // Empty query returns popular by default (Smithery sorts by relevance/popularity)
    const cacheKey = `search:${q}:${page}`;

    try {
      const data = await fetchWithCache(cacheKey, `${SMITHERY_BASE}/servers?${params}`);
      return c.json(data);
    } catch (err) {
      console.error(`[mcp-registry] Search failed for "${q}":`, (err as Error).message);
      return c.json({ error: 'MCP registry unreachable', servers: [], pagination: {} }, 502);
    }
  });

  // Server detail — returns tools, config schema, connections
  app.get('/mcp/registry/server/:name{.+}', async (c) => {
    const name = c.req.param('name');
    const cacheKey = `server:${name}`;

    try {
      const data = await fetchWithCache(cacheKey, `${SMITHERY_BASE}/servers/${encodeURIComponent(name)}`);
      return c.json(data);
    } catch (err) {
      console.error(`[mcp-registry] Server detail failed for "${name}":`, (err as Error).message);
      return c.json({ error: 'MCP registry unreachable' }, 502);
    }
  });

  return app;
}
