// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SSEEvent } from '@opentidy/shared';

interface GapToolDeps {
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

export function registerGapTools(server: McpServer, deps: GapToolDeps) {
  server.registerTool('gap_report', {
    title: 'Report Gap',
    description: 'Report a capability gap or limitation encountered during work',
    inputSchema: {
      title: z.string().min(1).describe('Short title of the gap'),
      problem: z.string().min(1).describe('Description of the problem'),
      impact: z.string().min(1).describe('Impact on the current task'),
      suggestion: z.string().min(1).describe('Suggested solution or workaround'),
    },
  }, (args) => {
    deps.gapsManager.appendGap(args);
    deps.sse.emit({
      type: 'amelioration:created',
      data: { title: args.title },
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: `Gap reported: "${args.title}"` }] };
  });
}
