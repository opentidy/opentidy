// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { createApprovalManager } from './approval';

describe('ApprovalManager', () => {
  it('summarizes and sends notification, resolves on approve', async () => {
    const summarize = vi.fn(async () => 'Send email to test@example.com about Hello');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    const promise = manager.requestApproval({
      taskId: 'task-1',
      toolName: 'mcp__email__send',
      toolInput: { to: 'test@example.com', subject: 'Hello' },
      moduleName: 'email',
    });

    // Wait for async summarize + send to complete
    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    const approvalId = sendConfirmation.mock.calls[0][0];

    manager.respond(approvalId, true);
    const result = await promise;
    expect(result).toBe(true);
    expect(summarize).toHaveBeenCalledWith('mcp__email__send', { to: 'test@example.com', subject: 'Hello' });
  });

  it('resolves false on deny', async () => {
    const summarize = vi.fn(async () => 'Send email');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    const promise = manager.requestApproval({
      taskId: 'task-1', toolName: 'mcp__email__send',
      toolInput: { to: 'test@example.com' }, moduleName: 'email',
    });

    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    manager.respond(sendConfirmation.mock.calls[0][0], false);
    expect(await promise).toBe(false);
  });

  it('lists pending approvals', async () => {
    const summarize = vi.fn(async () => 'Send email');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    manager.requestApproval({
      taskId: 'task-1', toolName: 'mcp__email__send', toolInput: {}, moduleName: 'email',
    });

    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    const pending = manager.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].taskId).toBe('task-1');
    expect(pending[0].toolName).toBe('mcp__email__send');
  });

  it('cancels pending approvals for a task', async () => {
    const summarize = vi.fn(async () => 'Click button');
    const sendConfirmation = vi.fn(async () => {});
    const manager = createApprovalManager({ summarize, sendConfirmation });

    const promise = manager.requestApproval({
      taskId: 'task-1', toolName: 'mcp__camofox__click', toolInput: {}, moduleName: 'browser',
    });

    await vi.waitFor(() => expect(sendConfirmation).toHaveBeenCalledOnce());
    manager.cancelTask('task-1');
    expect(await promise).toBe(false);
  });
});
