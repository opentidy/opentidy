// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, PermissionConfig, PermissionLevel, PermissionScope, ModulePermissionLevel } from '@opentidy/shared';

export interface ResolveResult {
  level: PermissionLevel;
  scope: PermissionScope;
  moduleName: string | null;
}

/** Normalize a module's permission value (string or {safe,critical,overrides}) into full form. */
function normalizeLevel(value: PermissionLevel | ModulePermissionLevel | undefined, fallback: PermissionLevel): ModulePermissionLevel {
  if (!value) return { safe: fallback, critical: fallback };
  if (typeof value === 'string') return { safe: value, critical: value };
  return value;
}

export function createPermissionResolver(
  manifests: Map<string, ModuleManifest>,
  config: PermissionConfig,
) {
  const toolIndex = new Map<string, { moduleName: string; isSafe: boolean; scope: PermissionScope }>();

  for (const [, manifest] of manifests) {
    if (!manifest.toolPermissions) continue;
    const { scope, safe, critical } = manifest.toolPermissions;
    for (const entry of safe) {
      const toolName = typeof entry === 'string' ? entry : entry.tool;
      toolIndex.set(toolName, { moduleName: manifest.name, isSafe: true, scope });
    }
    for (const entry of critical) {
      const toolName = typeof entry === 'string' ? entry : entry.tool;
      toolIndex.set(toolName, { moduleName: manifest.name, isSafe: false, scope });
    }
  }

  function getModuleLevels(moduleName: string): ModulePermissionLevel {
    return normalizeLevel(config.modules[moduleName], config.defaultLevel);
  }

  function getToolLevel(moduleName: string, toolName: string, isSafe: boolean): PermissionLevel {
    const levels = getModuleLevels(moduleName);
    // Per-tool override takes precedence
    if (levels.overrides?.[toolName]) return levels.overrides[toolName];
    return isSafe ? levels.safe : levels.critical;
  }

  function resolve(toolName: string): ResolveResult {
    const indexed = toolIndex.get(toolName);

    if (indexed) {
      const level = getToolLevel(indexed.moduleName, toolName, indexed.isSafe);
      return { level, scope: indexed.scope, moduleName: indexed.moduleName };
    }

    // Try to guess module from tool name pattern mcp__<server>__<action>
    const match = toolName.match(/^mcp__(.+?)__/);
    if (match) {
      const serverName = match[1];
      for (const [, manifest] of manifests) {
        if (manifest.mcpServers?.some(s => s.name === serverName)) {
          const levels = getModuleLevels(manifest.name);
          return { level: levels.critical, scope: 'per-call', moduleName: manifest.name };
        }
      }
    }

    // Completely unknown tool, fail-safe
    return { level: config.defaultLevel, scope: 'per-call', moduleName: null };
  }

  function getAllowedTools(): string[] {
    const tools: string[] = [];
    for (const [toolName, info] of toolIndex) {
      const level = getToolLevel(info.moduleName, toolName, info.isSafe);
      if (level === 'allow' || level === 'ask') {
        tools.push(toolName);
      }
    }
    return tools;
  }

  function getAskMatcher(): string {
    const askTools: string[] = [];
    for (const [toolName, info] of toolIndex) {
      const level = getToolLevel(info.moduleName, toolName, info.isSafe);
      if (level === 'ask') {
        askTools.push(toolName);
      }
    }
    return askTools.join('|');
  }

  return { resolve, getAllowedTools, getAskMatcher };
}
