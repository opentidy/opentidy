// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export function createPermissionState() {
  const grants = new Map<string, Set<string>>();

  return {
    isGranted(jobId: string, moduleName: string): boolean {
      return grants.get(jobId)?.has(moduleName) ?? false;
    },

    grant(jobId: string, moduleName: string): void {
      if (!grants.has(jobId)) grants.set(jobId, new Set());
      grants.get(jobId)!.add(moduleName);
    },

    revokeJob(jobId: string): void {
      grants.delete(jobId);
    },
  };
}
