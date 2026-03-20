// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ModuleManifest, PermissionConfig } from '@opentidy/shared';

export interface PermissionCheckDeps {
  manifests: Map<string, ModuleManifest>;
  loadConfig: () => PermissionConfig;
  state: {
    isGranted(jobId: string, moduleName: string): boolean;
    grant(jobId: string, moduleName: string): void;
  };
  requestApproval: (opts: {
    jobId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    moduleName: string | null;
  }) => Promise<boolean>;
  audit: {
    log(input: { sessionId: string; toolName: string; toolInput: Record<string, unknown>; decision: string }): void;
  };
}
