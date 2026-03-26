// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ModuleManifestSchema, MODULE_NAME_REGEX } from '@opentidy/shared';
import type { ModuleManifest } from '@opentidy/shared';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateModule(
  name: string,
  customModulesDir: string,
  curatedNames: Set<string>,
): ValidationResult {
  const errors: string[] = [];

  // 1. Name format
  if (!MODULE_NAME_REGEX.test(name)) {
    errors.push(`Module name "${name}" is invalid — must match /^[a-z0-9-]+$/ (lowercase letters, numbers, hyphens only)`);
    return { valid: false, errors };
  }

  // 2. module.json exists
  const moduleDir = join(customModulesDir, name);
  const manifestPath = join(moduleDir, 'module.json');
  if (!existsSync(manifestPath)) {
    errors.push(`module.json not found at ${manifestPath}`);
    return { valid: false, errors };
  }

  // 3. JSON parses
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    errors.push(`module.json is not valid JSON: ${(err as Error).message}`);
    return { valid: false, errors };
  }

  // 4. Zod validation
  const result = ModuleManifestSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`Manifest validation error at ${issue.path.join('.')}: ${issue.message}`);
    }
    return { valid: false, errors };
  }

  const manifest: ModuleManifest = result.data;

  // 5. Curated name collision
  if (curatedNames.has(manifest.name)) {
    errors.push(`Module name "${manifest.name}" collides with a curated module — choose a different name`);
  }

  // 6. Referenced files exist
  for (const receiver of manifest.receivers ?? []) {
    if (receiver.transform) {
      const transformPath = join(moduleDir, receiver.transform);
      if (!existsSync(transformPath)) {
        errors.push(`Receiver "${receiver.name}" references transform "${receiver.transform}" but file not found at ${transformPath}`);
      }
    }
    if (receiver.entry) {
      const entryPath = join(moduleDir, receiver.entry);
      if (!existsSync(entryPath)) {
        errors.push(`Receiver "${receiver.name}" references entry "${receiver.entry}" but file not found at ${entryPath}`);
      }
    }
  }

  // 7. MCP server command resolvable
  for (const server of manifest.mcpServers ?? []) {
    if (server.url) continue; // HTTP-based, no command to check
    if (!server.command) continue;
    if (server.command === 'npx') continue; // Can't validate npm packages without running them
    try {
      execFileSync('which', [server.command], { stdio: 'pipe' });
    } catch {
      errors.push(`MCP server "${server.name}" uses command "${server.command}" which is not found in PATH`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface ValidateModuleDeps {
  paths: { customModules: string };
  manifests: Map<string, ModuleManifest>;
}

export function registerValidateModuleTools(server: McpServer, deps: ValidateModuleDeps) {
  server.registerTool('validate_module', {
    title: 'Validate Module',
    description: 'Validate a custom module manifest and its referenced files. The module must be in ~/.config/opentidy/modules/<name>/ with a valid module.json.',
    inputSchema: {
      name: z.string().describe('Module name (kebab-case)'),
    },
  }, ({ name }) => {
    // Build curated names set (modules that aren't custom source)
    const curatedNames = new Set<string>();
    for (const [n] of deps.manifests) {
      curatedNames.add(n);
    }
    // Don't flag collision with the module itself (re-validation)
    curatedNames.delete(name);

    const result = validateModule(name, deps.paths.customModules, curatedNames);

    if (result.valid) {
      return { content: [{ type: 'text' as const, text: `Module "${name}" is valid.` }] };
    }
    return {
      content: [{ type: 'text' as const, text: `Module "${name}" has ${result.errors.length} error(s):\n${result.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}` }],
      isError: true,
    };
  });
}
