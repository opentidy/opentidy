// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ModuleManifest } from '@opentidy/shared';
import { validateModule } from './validate-module.js';
import { loadModuleManifest } from '../../modules/loader.js';
import { join } from 'path';

export interface RegisterModuleDeps {
  paths: { customModules: string };
  manifests: Map<string, ModuleManifest>;
  lifecycle: { registerCustomModule(name: string, manifest: ModuleManifest): void };
}

export function registerRegisterModuleTools(server: McpServer, deps: RegisterModuleDeps) {
  server.registerTool('register_module', {
    title: 'Register Module',
    description: 'Validate and register a custom module from ~/.config/opentidy/modules/<name>/. The module must have a valid module.json. After registration, the module appears in the web app ready to be enabled.',
    inputSchema: {
      name: z.string().describe('Module name (kebab-case, e.g., "my-module")'),
    },
  }, ({ name }) => {
    // Build curated names set, excluding the module itself (for re-registration)
    const curatedNames = new Set<string>();
    for (const [n] of deps.manifests) {
      curatedNames.add(n);
    }
    curatedNames.delete(name);

    // Validate first
    const validation = validateModule(name, deps.paths.customModules, curatedNames);
    if (!validation.valid) {
      return {
        content: [{ type: 'text' as const, text: `Cannot register module "${name}" — validation failed:\n${validation.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}` }],
        isError: true,
      };
    }

    // Load manifest from disk
    const moduleDir = join(deps.paths.customModules, name);
    const manifest = loadModuleManifest(moduleDir);

    // Register via shared lifecycle logic
    deps.lifecycle.registerCustomModule(name, manifest);

    return {
      content: [{ type: 'text' as const, text: `Module "${name}" registered successfully. It is now available in the web app — enable it to start using it.` }],
    };
  });
}
