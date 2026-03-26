// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export interface McpPackage {
  name: string;
  description: string;
  command: string;
  args: string[];
  verified: boolean;
  useCount?: number;
}

export interface SearchResult {
  packages: McpPackage[];
  pagination: { page: number; totalPages: number };
}

export interface SearchProvider {
  name: string;
  search(query: string, page?: number): Promise<SearchResult>;
}

interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  verified: boolean;
  useCount: number;
}

interface SmitheryResponse {
  servers: SmitheryServer[];
  pagination: { currentPage: number; totalPages: number; totalCount: number; pageSize: number };
}

const SMITHERY_BASE = 'https://registry.smithery.ai';
const DEFAULT_TTL_MS = 3_600_000; // 1 hour

export function createSmitheryProvider(
  fetchFn: typeof fetch = fetch,
  options?: { ttlMs?: number },
): SearchProvider {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cache = new Map<string, { data: SearchResult; fetchedAt: number }>();

  return {
    name: 'smithery',
    async search(query: string, page = 1): Promise<SearchResult> {
      const cacheKey = `search:${query}:${page}`;
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.fetchedAt < ttlMs) {
        return cached.data;
      }

      try {
        const url = `${SMITHERY_BASE}/api/v1/servers?q=${encodeURIComponent(query)}&page=${page}&pageSize=20`;
        const res = await fetchFn(url);
        if (!res.ok) throw new Error(`Smithery returned ${res.status}`);

        const body = (await res.json()) as SmitheryResponse;
        const result: SearchResult = {
          packages: body.servers.map((s) => ({
            name: s.qualifiedName,
            description: s.description,
            command: 'npx',
            args: ['-y', s.qualifiedName],
            verified: s.verified,
            useCount: s.useCount,
          })),
          pagination: { page: body.pagination.currentPage, totalPages: body.pagination.totalPages },
        };

        cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
        return result;
      } catch (error) {
        console.warn('[modules] Smithery search failed, using stale cache', error);
        if (cached) return cached.data;
        return { packages: [], pagination: { page: 1, totalPages: 0 } };
      }
    },
  };
}

const providers = new Map<string, SearchProvider>();

let defaultProvider: SearchProvider | undefined;

export function resolveProvider(name?: string): SearchProvider {
  if (!defaultProvider) {
    defaultProvider = createSmitheryProvider();
    providers.set('smithery', defaultProvider);
  }
  return providers.get(name ?? 'smithery') ?? defaultProvider;
}
