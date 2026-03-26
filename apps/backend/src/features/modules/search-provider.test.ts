// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { createSmitheryProvider, resolveProvider } from './search-provider.js';

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

const SMITHERY_RESPONSE = {
  servers: [
    {
      qualifiedName: '@test/mcp-server',
      displayName: 'Test Server',
      description: 'A test MCP server',
      verified: true,
      useCount: 42,
    },
  ],
  pagination: { currentPage: 1, totalPages: 1, totalCount: 1, pageSize: 20 },
};

describe('SmitheryProvider', () => {
  it('maps smithery response to McpPackage format', async () => {
    const provider = createSmitheryProvider(mockFetchOk(SMITHERY_RESPONSE));
    const result = await provider.search('test');

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toEqual({
      name: '@test/mcp-server',
      description: 'A test MCP server',
      command: 'npx',
      args: ['-y', '@test/mcp-server'],
      verified: true,
      useCount: 42,
    });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1 });
  });

  it('returns cached results on second call within TTL', async () => {
    const fetchFn = mockFetchOk(SMITHERY_RESPONSE);
    const provider = createSmitheryProvider(fetchFn);

    await provider.search('test');
    await provider.search('test');

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses different cache keys for different queries', async () => {
    const fetchFn = mockFetchOk(SMITHERY_RESPONSE);
    const provider = createSmitheryProvider(fetchFn);

    await provider.search('notion');
    await provider.search('slack');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('uses different cache keys for different pages', async () => {
    const fetchFn = mockFetchOk(SMITHERY_RESPONSE);
    const provider = createSmitheryProvider(fetchFn);

    await provider.search('test', 1);
    await provider.search('test', 2);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('falls back to stale cache on fetch error', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(SMITHERY_RESPONSE),
      })
      .mockRejectedValueOnce(new Error('network error')) as unknown as typeof fetch;

    const provider = createSmitheryProvider(fetchFn, { ttlMs: 0 });
    await provider.search('test');
    const second = await provider.search('test');

    expect(second.packages[0].name).toBe('@test/mcp-server');
  });

  it('returns empty results when no cache and fetch fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const provider = createSmitheryProvider(fetchFn);
    const result = await provider.search('test');

    expect(result.packages).toHaveLength(0);
    expect(result.pagination).toEqual({ page: 1, totalPages: 0 });
  });
});

describe('resolveProvider', () => {
  it('returns smithery by default', () => {
    const provider = resolveProvider();
    expect(provider.name).toBe('smithery');
  });

  it('returns smithery for unknown provider name', () => {
    const provider = resolveProvider('nonexistent');
    expect(provider.name).toBe('smithery');
  });
});
