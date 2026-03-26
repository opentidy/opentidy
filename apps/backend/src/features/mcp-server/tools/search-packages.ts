// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SearchProvider } from '../../modules/search-provider.js';

export interface SearchPackagesDeps {
  resolveSearchProvider: (name?: string) => SearchProvider;
}

export function registerSearchPackagesTools(server: McpServer, deps: SearchPackagesDeps) {
  server.registerTool('search_mcp_packages', {
    title: 'Search MCP Packages',
    description: 'Search for MCP server packages in external registries (Smithery by default). Returns package names, descriptions, install commands, and popularity.',
    inputSchema: {
      query: z.string().describe('Search query (e.g., "notion", "slack", "calendar")'),
      provider: z.string().optional().describe('Search provider name (default: "smithery")'),
      page: z.number().optional().describe('Page number for pagination (default: 1)'),
    },
  }, async ({ query, provider: providerName, page }) => {
    try {
      const provider = deps.resolveSearchProvider(providerName);
      const result = await provider.search(query, page ?? 1);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Search failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });
}
