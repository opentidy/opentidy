// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, PermissionConfig, PermissionLevel, PermissionScope } from '@opentidy/shared';

export interface ResolveResult {
  level: PermissionLevel;
  scope: PermissionScope;
  moduleName: string | null;
}

export function createPermissionResolver(
  manifests: Map<string, ModuleManifest>,
  config: PermissionConfig,
) {
  const toolIndex = new Map<string, { moduleName: string; isSafe: boolean; scope: PermissionScope }>();

  for (const [, manifest] of manifests) {
    if (!manifest.toolPermissions) continue;
    const { scope, safe, critical } = manifest.toolPermissions;
    for (const tool of safe) {
      toolIndex.set(tool, { moduleName: manifest.name, isSafe: true, scope });
    }
    for (const tool of critical) {
      toolIndex.set(tool, { moduleName: manifest.name, isSafe: false, scope });
    }
  }

  function getModuleLevel(moduleName: string): PermissionLevel {
    return config.modules[moduleName] ?? config.defaultLevel;
  }

  function resolve(toolName: string): ResolveResult {
    const indexed = toolIndex.get(toolName);

    if (indexed) {
      if (indexed.isSafe) {
        return { level: 'allow', scope: indexed.scope, moduleName: indexed.moduleName };
      }
      return { level: getModuleLevel(indexed.moduleName), scope: indexed.scope, moduleName: indexed.moduleName };
    }

    // Try to guess module from tool name pattern mcp__<server>__<action>
    const match = toolName.match(/^mcp__(.+?)__/);
    if (match) {
      const serverName = match[1];
      for (const [, manifest] of manifests) {
        if (manifest.mcpServers?.some(s => s.name === serverName)) {
          return { level: getModuleLevel(manifest.name), scope: 'per-call', moduleName: manifest.name };
        }
      }
    }

    // Completely unknown tool — fail-safe
    return { level: config.defaultLevel, scope: 'per-call', moduleName: null };
  }

  function getAllowedTools(): string[] {
    const tools: string[] = [];
    for (const [toolName, info] of toolIndex) {
      if (info.isSafe) {
        tools.push(toolName);
      } else {
        const level = getModuleLevel(info.moduleName);
        if (level === 'allow' || level === 'confirm') {
          tools.push(toolName);
        }
      }
    }
    return tools;
  }

  function getConfirmMatcher(): string {
    const confirmTools: string[] = [];
    for (const [toolName, info] of toolIndex) {
      if (!info.isSafe && getModuleLevel(info.moduleName) === 'confirm') {
        confirmTools.push(toolName);
      }
    }
    return confirmTools.join('|');
  }

  return { resolve, getAllowedTools, getConfirmMatcher };
}
