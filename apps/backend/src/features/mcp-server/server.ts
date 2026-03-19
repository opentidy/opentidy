// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { SSEEvent } from '@opentidy/shared';
import type { Scheduler } from '../scheduler/scheduler.js';
import { registerScheduleTools } from './tools/schedule.js';
import { registerSuggestionTools } from './tools/suggestion.js';
import { registerGapTools } from './tools/gap.js';

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
}

export function createMcpServer(deps: McpServerDeps) {
  const server = new McpServer({
    name: 'opentidy',
    version: '1.0.0',
  });

  registerScheduleTools(server, { scheduler: deps.scheduler });
  registerSuggestionTools(server, { suggestionsManager: deps.suggestionsManager, sse: deps.sse });
  registerGapTools(server, { gapsManager: deps.gapsManager, sse: deps.sse });

  async function handleRequest(request: Request): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return response ?? new Response('Method not allowed', { status: 405 });
  }

  return { server, handleRequest };
}
