// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createPermissionResolver } from './resolver.js';
import type { PermissionCheckDeps } from './types.js';

export function createPermissionChecker(deps: PermissionCheckDeps) {
  async function check(
    taskId: string,
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<'allow' | 'deny'> {
    const config = deps.loadConfig();
    const resolver = createPermissionResolver(deps.manifests, config);
    const { level, scope, moduleName } = resolver.resolve(toolName);

    // 1. Allow — always pass (safe tools land here too)
    if (level === 'allow') {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'ALLOW' });
      return 'allow';
    }

    // 2. Block — deny defensively (should never reach endpoint in normal flow)
    if (level === 'block') {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'BLOCK' });
      return 'deny';
    }

    // level === 'ask' from here

    // 3. Per-task: check if already granted for this task session
    if (scope === 'per-task' && moduleName && deps.state.isGranted(taskId, moduleName)) {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'ALLOW' });
      return 'allow';
    }

    // 4. Request human approval
    const approved = await deps.requestApproval({ taskId, toolName, toolInput, moduleName });

    if (!approved) {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'DENY' });
      return 'deny';
    }

    // 5. Approved — persist per-task grant if applicable
    if (scope === 'per-task' && moduleName) {
      deps.state.grant(taskId, moduleName);
    }

    deps.audit.log({ sessionId, toolName, toolInput, decision: 'ALLOW' });
    return 'allow';
  }

  return { check };
}
