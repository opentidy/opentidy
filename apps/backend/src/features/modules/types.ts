// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, OpenTidyConfig } from '@opentidy/shared';

export interface ModuleRouteDeps {
  manifests: Map<string, ModuleManifest>;
  loadConfig: () => OpenTidyConfig;
  lifecycle: {
    enable(name: string): Promise<void>;
    disable(name: string): Promise<void>;
    configure(name: string, config: Record<string, unknown>): Promise<void>;
  };
  saveConfig: (config: OpenTidyConfig) => void;
}
