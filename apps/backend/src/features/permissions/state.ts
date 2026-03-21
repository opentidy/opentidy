// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export function createPermissionState() {
  const grants = new Map<string, Set<string>>();

  return {
    isGranted(taskId: string, moduleName: string): boolean {
      return grants.get(taskId)?.has(moduleName) ?? false;
    },

    grant(taskId: string, moduleName: string): void {
      if (!grants.has(taskId)) grants.set(taskId, new Set());
      grants.get(taskId)!.add(moduleName);
    },

    revokeTask(taskId: string): void {
      grants.delete(taskId);
    },
  };
}
