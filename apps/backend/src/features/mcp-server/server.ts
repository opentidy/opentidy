// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { SSEEvent, ModuleManifest } from '@opentidy/shared';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { OpenTidyPaths } from '../../shared/paths.js';
import type { SearchProvider } from '../modules/search-provider.js';
import { registerScheduleTools } from './tools/schedule.js';
import { registerSuggestionTools } from './tools/suggestion.js';
import { registerGapTools } from './tools/gap.js';
import { registerSearchPackagesTools } from './tools/search-packages.js';
import { registerValidateModuleTools } from './tools/validate-module.js';
import { registerRegisterModuleTools } from './tools/register-module.js';
import type { DynamicToolRegistry } from './dynamic-tools.js';

export interface McpServerDeps {
  scheduler: Scheduler;
  suggestionsManager: {
    writeSuggestion(data: {
      title: string;
      urgency: string;
      source: string;
      summary: string;
      why: string;
      whatIWouldDo: string;
    }): string;
  };
  gapsManager: {
    appendGap(data: {
      title: string;
      problem: string;
      impact: string;
      suggestion: string;
    }): void;
  };
  sse: { emit(event: SSEEvent): void };
  manifests: Map<string, ModuleManifest>;
  paths: OpenTidyPaths;
  lifecycle: { registerCustomModule(name: string, manifest: ModuleManifest): void };
  resolveSearchProvider: (name?: string) => SearchProvider;
  dynamicToolRegistry?: DynamicToolRegistry;
}

function registerAllTools(server: McpServer, deps: McpServerDeps): void {
  registerScheduleTools(server, { scheduler: deps.scheduler });
  registerSuggestionTools(server, { suggestionsManager: deps.suggestionsManager, sse: deps.sse });
  registerGapTools(server, { gapsManager: deps.gapsManager, sse: deps.sse });
  registerSearchPackagesTools(server, { resolveSearchProvider: deps.resolveSearchProvider });
  registerValidateModuleTools(server, { paths: deps.paths, manifests: deps.manifests });
  registerRegisterModuleTools(server, { paths: deps.paths, manifests: deps.manifests, lifecycle: deps.lifecycle });

  // Register dynamic tools from daemon modules
  if (deps.dynamicToolRegistry) {
    for (const tool of deps.dynamicToolRegistry.listAll()) {
      server.tool(tool.name, tool.schema.description, async () => {
        return deps.dynamicToolRegistry!.execute(tool.name, {});
      });
    }
  }
}

export function createMcpServer(deps: McpServerDeps) {
  // Stateless mode: create a fresh McpServer + transport per request.
  // Reusing a single McpServer fails on the 2nd request with "Already connected to a transport".
  async function handleRequest(request: Request): Promise<Response> {
    const server = new McpServer({ name: 'opentidy', version: '1.0.0' });
    registerAllTools(server, deps);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return response ?? new Response('Method not allowed', { status: 405 });
  }

  return { handleRequest };
}
