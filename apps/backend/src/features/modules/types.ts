// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, OpenTidyConfig } from '@opentidy/shared';

export interface ModuleRouteDeps {
  manifests: Map<string, ModuleManifest>;
  loadConfig: () => OpenTidyConfig;
  lifecycle: {
    enable(name: string): Promise<void>;
    disable(name: string, cleanData?: boolean): Promise<void>;
    configure(name: string, config: Record<string, unknown>): Promise<void>;
    registerCustomModule(name: string, manifest: ModuleManifest): void;
    restartDaemon?(name: string): Promise<void>;
  };
  saveConfig: (config: OpenTidyConfig) => void;
  paths?: { customModules: string; modulesData?: string };
  /** Tracks active module setup sessions — verify checks this before returning ready */
  setupTracker?: {
    getStatus(moduleName: string): Promise<{ running: boolean; exitCode?: number } | null>;
  };
  keychain?: {
    getPassword(moduleName: string, key: string): string | null;
  };
}
