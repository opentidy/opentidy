// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import crypto from 'crypto';

interface PendingApproval {
  id: string;
  jobId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  moduleName: string | null;
  summary: string;
  createdAt: string;
  resolve: (approved: boolean) => void;
}

interface ApprovalRequest {
  jobId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  moduleName: string | null;
}

interface ApprovalDeps {
  summarize: (toolName: string, toolInput: Record<string, unknown>) => Promise<string>;
  sendConfirmation: (
    approvalId: string,
    jobId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    moduleName: string | null,
    summary: string,
  ) => Promise<void>;
}

export function createApprovalManager(deps: ApprovalDeps) {
  const pending = new Map<string, PendingApproval>();

  async function requestApproval(opts: ApprovalRequest): Promise<boolean> {
    const id = crypto.randomUUID();

    let summary: string;
    try {
      summary = await deps.summarize(opts.toolName, opts.toolInput);
    } catch (err) {
      console.error('[permissions] Summarize failed, using fallback:', err);
      summary = `${opts.moduleName ?? 'unknown'}: ${opts.toolName}`;
    }

    return new Promise<boolean>((resolvePromise) => {
      pending.set(id, {
        id,
        jobId: opts.jobId,
        toolName: opts.toolName,
        toolInput: opts.toolInput,
        moduleName: opts.moduleName,
        summary,
        createdAt: new Date().toISOString(),
        resolve: resolvePromise,
      });
      deps
        .sendConfirmation(id, opts.jobId, opts.toolName, opts.toolInput, opts.moduleName, summary)
        .catch((err) => console.error('[permissions] Failed to send confirmation:', err));
    });
  }

  function respond(approvalId: string, approved: boolean): boolean {
    const entry = pending.get(approvalId);
    if (!entry) return false;
    pending.delete(approvalId);
    entry.resolve(approved);
    return true;
  }

  function cancelJob(jobId: string): void {
    for (const [id, entry] of pending) {
      if (entry.jobId === jobId) {
        pending.delete(id);
        entry.resolve(false);
      }
    }
  }

  function listPending(): Array<Omit<PendingApproval, 'resolve'>> {
    return Array.from(pending.values()).map(({ resolve: _, ...rest }) => rest);
  }

  return { requestApproval, respond, cancelJob, listPending };
}
