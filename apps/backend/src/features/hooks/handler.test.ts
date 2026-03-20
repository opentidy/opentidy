// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// tests/hooks/handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHooksHandler } from './handler.js';
import type { HookPayload } from '@opentidy/shared';

describe('HooksHandler — endpoint centralisé /api/hooks', () => {
  let mockLauncher: any;
  let mockAudit: any;
  let mockNotify: any;
  let mockSse: any;
  let handler: ReturnType<typeof createHooksHandler>;

  beforeEach(() => {
    mockLauncher = {
      handleSessionEnd: vi.fn(),
      markWaiting: vi.fn(),
    };
    mockAudit = { log: vi.fn() };
    mockNotify = {
      notifyCompleted: vi.fn(),
      notifyIdle: vi.fn(),
    };
    mockSse = { emit: vi.fn() };

    handler = createHooksHandler({
      launcher: mockLauncher,
      audit: mockAudit,
      notify: mockNotify,
      sse: mockSse,
    });
  });

  // === PostToolUse ===

  // E2E-GF-12 : PostToolUse → audit.log contient sessionId, toolName, toolInput, decision
  it('PostToolUse → audit log written with all fields', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__gmail__send',
      tool_input: { to: 'billing@example-client.com', subject: 'Facture mars' },
    };

    handler.handle(payload);

    expect(mockAudit.log).toHaveBeenCalledWith({
      sessionId: 'opentidy-invoices-acme',
      toolName: 'mcp__gmail__send',
      toolInput: { to: 'billing@example-client.com', subject: 'Facture mars' },
      decision: 'ALLOW',
    });
  });

  // PostToolUse audit only — no launcher call
  it('PostToolUse → audit log only, no launcher call', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    };

    handler.handle(payload);

    expect(mockAudit.log).toHaveBeenCalled();
    expect(mockLauncher.handleSessionEnd).not.toHaveBeenCalled();
    expect(mockLauncher.markWaiting).not.toHaveBeenCalled();
  });

  // === PreToolUse — audit only ===

  it('PreToolUse → audit log only, no launcher call', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-test-job',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/some/file' },
    };

    handler.handle(payload);

    expect(mockAudit.log).toHaveBeenCalledWith({
      sessionId: 'opentidy-test-job',
      toolName: 'Read',
      toolInput: { file_path: '/some/file' },
      decision: 'ALLOW',
    });
    expect(mockLauncher.handleSessionEnd).not.toHaveBeenCalled();
    expect(mockLauncher.markWaiting).not.toHaveBeenCalled();
  });

  // === Notification → notify only, no launcher state change ===

  it('Notification → notifies via notifier when notifyIdle available', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'Notification',
    };

    handler.handle(payload);

    expect(mockNotify.notifyIdle).toHaveBeenCalledWith('invoices-acme');
    expect(mockLauncher.markWaiting).not.toHaveBeenCalled();
    expect(mockLauncher.handleSessionEnd).not.toHaveBeenCalled();
  });

  it('Notification → works without notifyIdle on notifier', () => {
    mockNotify = {
      notifyCompleted: vi.fn(),
      // no notifyIdle
    };
    handler = createHooksHandler({
      launcher: mockLauncher,
      audit: mockAudit,
      notify: mockNotify,
      sse: mockSse,
    });

    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'Notification',
    };

    // Should not throw
    handler.handle(payload);
    expect(mockLauncher.markWaiting).not.toHaveBeenCalled();
  });

  // === SessionEnd → cleanup ===

  // E2E-LCH-05 : SessionEnd → cleanup
  it('SessionEnd → calls handleSessionEnd on launcher (no claudeSessionId)', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'SessionEnd',
    };

    handler.handle(payload);

    expect(mockLauncher.handleSessionEnd).toHaveBeenCalledWith('invoices-acme');
  });

  it('SessionEnd → emits session:ended SSE', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'SessionEnd',
    };

    handler.handle(payload);

    expect(mockSse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:ended',
        data: { jobId: 'invoices-acme' },
      }),
    );
  });

  // === Stop → markWaiting + session:idle SSE ===

  it('Stop → calls markWaiting on launcher', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'Stop',
    };

    handler.handle(payload);

    expect(mockLauncher.markWaiting).toHaveBeenCalledWith('invoices-acme');
  });

  it('Stop → emits session:idle SSE event', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-invoices-acme',
      hook_event_name: 'Stop',
    };

    handler.handle(payload);

    expect(mockSse.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session:idle',
        data: { jobId: 'invoices-acme' },
      }),
    );
  });

  // === E2E-GF-18 : Multiple hooks same call → all logged ===

  it('multiple hooks processed sequentially → all audit logged', () => {
    const payloads: HookPayload[] = [
      {
        session_id: 'opentidy-invoices-acme',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/a' },
      },
      {
        session_id: 'opentidy-invoices-acme',
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/a' },
      },
      {
        session_id: 'opentidy-invoices-acme',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/b' },
      },
    ];

    for (const p of payloads) {
      handler.handle(p);
    }

    expect(mockAudit.log).toHaveBeenCalledTimes(3);
  });

  // === Payload parsing ===

  it('parsePayload validates valid hook payload', () => {
    const result = handler.parsePayload({
      session_id: 'opentidy-test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session_id).toBe('opentidy-test');
    }
  });

  it('parsePayload rejects invalid hook payload', () => {
    const result = handler.parsePayload({
      session_id: 'opentidy-test',
      hook_event_name: 'InvalidEvent',
    });

    expect(result.success).toBe(false);
  });

  // === Edge cases ===

  it('ignores unknown session format', () => {
    const payload: HookPayload = {
      session_id: 'random-session',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: {},
    };

    const result = handler.handle(payload);

    expect(result.status).toBe('ignored');
    expect(mockAudit.log).not.toHaveBeenCalled();
  });

  it('handles PostToolUse without tool_name gracefully', () => {
    const payload: HookPayload = {
      session_id: 'opentidy-test',
      hook_event_name: 'PostToolUse',
    };

    handler.handle(payload);

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'unknown', toolInput: {} }),
    );
  });
});