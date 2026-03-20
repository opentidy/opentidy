// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { createPermissionResolver } from './resolver.js';
import type { PermissionCheckDeps } from './types.js';

export function createPermissionChecker(deps: PermissionCheckDeps) {
  async function check(
    jobId: string,
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

    // 2. Ask — deny defensively (should never reach endpoint in normal flow)
    if (level === 'ask') {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'ASK' });
      return 'deny';
    }

    // level === 'confirm' from here

    // 3. Per-job: check if already granted for this job session
    if (scope === 'per-job' && moduleName && deps.state.isGranted(jobId, moduleName)) {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'ALLOW' });
      return 'allow';
    }

    // 4. Request human approval
    const approved = await deps.requestApproval({ jobId, toolName, toolInput, moduleName });

    if (!approved) {
      deps.audit.log({ sessionId, toolName, toolInput, decision: 'DENY' });
      return 'deny';
    }

    // 5. Approved — persist per-job grant if applicable
    if (scope === 'per-job' && moduleName) {
      deps.state.grant(jobId, moduleName);
    }

    deps.audit.log({ sessionId, toolName, toolInput, decision: 'ALLOW' });
    return 'allow';
  }

  return { check };
}
