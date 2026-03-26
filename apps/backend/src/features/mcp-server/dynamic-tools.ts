// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ToolSchema, ToolHandler } from '@opentidy/shared';

interface RegisteredTool {
  name: string;
  schema: ToolSchema;
  handler: ToolHandler;
}

interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
}

export interface DynamicToolRegistry {
  register(name: string, schema: ToolSchema, handler: ToolHandler): void;
  unregister(name: string): void;
  listAll(): RegisteredTool[];
  execute(name: string, input: Record<string, unknown>): Promise<McpToolResult>;
  has(name: string): boolean;
}

export function createDynamicToolRegistry(): DynamicToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  return {
    register(name, schema, handler) {
      tools.set(name, { name, schema, handler });
    },
    unregister(name) {
      tools.delete(name);
    },
    listAll() {
      return [...tools.values()];
    },
    async execute(name, input) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown dynamic tool: ${name}`);
      const result = await tool.handler(input);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      return { content: [{ type: 'text', text }] };
    },
    has(name) {
      return tools.has(name);
    },
  };
}
