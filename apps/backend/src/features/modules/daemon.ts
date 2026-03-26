// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { mkdirSync } from 'fs';
import { join } from 'path';
import type { ReceiverEvent, ModuleContext, SSEEvent } from '@opentidy/shared';
import type { DynamicToolRegistry } from '../mcp-server/dynamic-tools.js';

export interface InternalModuleContext extends ModuleContext {
  runShutdownHandlers(): Promise<void>;
  unregisterAllTools(): void;
}

export function createModuleContext(
  name: string,
  moduleConfig: Record<string, unknown>,
  emitToTriage: (event: ReceiverEvent) => void,
  dynamicToolRegistry: DynamicToolRegistry,
  modulesDataBaseDir: string,
  sseEmit?: (event: SSEEvent) => void,
): InternalModuleContext {
  const dataDir = join(modulesDataBaseDir, name);
  mkdirSync(dataDir, { recursive: true });

  const shutdownHandlers: Array<() => void | Promise<void>> = [];
  const registeredTools: string[] = [];

  return {
    config: moduleConfig,
    dataDir,
    emit: emitToTriage,
    emitSSE(event: SSEEvent) {
      sseEmit?.(event);
    },
    registerTool(toolName, schema, handler) {
      dynamicToolRegistry.register(toolName, schema, handler);
      registeredTools.push(toolName);
    },
    logger: {
      log: (msg: string, ...args: unknown[]) => console.log(`[${name}]`, msg, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[${name}]`, msg, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[${name}]`, msg, ...args),
    },
    onShutdown(fn) {
      shutdownHandlers.push(fn);
    },
    async runShutdownHandlers() {
      for (const fn of shutdownHandlers) await fn();
    },
    unregisterAllTools() {
      for (const t of registeredTools) dynamicToolRegistry.unregister(t);
      registeredTools.length = 0;
    },
  };
}
