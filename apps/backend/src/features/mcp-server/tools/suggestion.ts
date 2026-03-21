// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SSEEvent } from '@opentidy/shared';

interface SuggestionToolDeps {
  suggestionsManager: {
    writeSuggestion(data: {
      title: string;
      urgency: string;
      source: string;
      summary: string;
      why: string;
      whatIWouldDo: string;
    }): string; // returns slug
  };
  sse: { emit(event: SSEEvent): void };
}

export function registerSuggestionTools(server: McpServer, deps: SuggestionToolDeps) {
  server.registerTool('suggestion_create', {
    title: 'Create Suggestion',
    description: 'Suggest a new task for the user to approve',
    inputSchema: {
      title: z.string().min(1).describe('Suggestion title'),
      urgency: z.enum(['urgent', 'normal', 'low']).describe('Urgency level'),
      source: z.string().min(1).describe('What triggered this suggestion'),
      summary: z.string().min(1).describe('Brief summary'),
      why: z.string().min(1).describe('Why this should be a task'),
      whatIWouldDo: z.string().min(1).describe('What the agent would do'),
    },
  }, (args) => {
    const slug = deps.suggestionsManager.writeSuggestion(args);
    deps.sse.emit({
      type: 'suggestion:created',
      data: { slug, title: args.title },
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: `Suggestion "${args.title}" created (${slug})` }] };
  });
}
