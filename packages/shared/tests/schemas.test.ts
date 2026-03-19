// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import {
  GmailWebhookSchema,
  CreateDossierSchema,
  DossierInstructionSchema,
  ApproveSuggestionSchema,
  HookPayloadSchema,
  MarketplaceMcpSchema,
  UserSkillSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  SetupUserInfoSchema,
} from '../src/schemas.js';

describe('GmailWebhookSchema', () => {
  it('should validate a valid webhook', () => {
    const valid = {
      from: 'test@example.com',
      to: 'me@example.com',
      subject: 'Test',
      body: 'Hello',
      messageId: 'msg-123',
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(GmailWebhookSchema.parse(valid)).toEqual(valid);
  });

  it('should accept optional threadId', () => {
    const valid = {
      from: 'test@example.com',
      to: 'me@example.com',
      subject: 'Test',
      body: 'Hello',
      messageId: 'msg-123',
      threadId: 'thread-456',
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(GmailWebhookSchema.parse(valid)).toEqual(valid);
  });

  it('should reject missing required fields', () => {
    expect(() => GmailWebhookSchema.parse({})).toThrow();
    expect(() => GmailWebhookSchema.parse({ from: 'test@example.com' })).toThrow();
  });
});

describe('CreateDossierSchema', () => {
  it('should validate with instruction', () => {
    const result = CreateDossierSchema.parse({ instruction: 'Do something' });
    expect(result.instruction).toBe('Do something');
    expect(result.confirm).toBe(false); // default
  });

  it('should accept confirm override', () => {
    const result = CreateDossierSchema.parse({ instruction: 'Do something', confirm: true });
    expect(result.confirm).toBe(true);
  });

  it('should reject empty instruction', () => {
    expect(() => CreateDossierSchema.parse({ instruction: '' })).toThrow();
  });

  it('should reject missing instruction', () => {
    expect(() => CreateDossierSchema.parse({})).toThrow();
  });
});

describe('DossierInstructionSchema', () => {
  it('should validate with instruction', () => {
    const result = DossierInstructionSchema.parse({ instruction: 'Update status' });
    expect(result.instruction).toBe('Update status');
    expect(result.confirm).toBe(false);
  });

  it('should reject empty instruction', () => {
    expect(() => DossierInstructionSchema.parse({ instruction: '' })).toThrow();
  });
});

describe('ApproveSuggestionSchema', () => {
  it('should validate with optional instruction', () => {
    expect(ApproveSuggestionSchema.parse({})).toEqual({});
    expect(ApproveSuggestionSchema.parse({ instruction: 'Go ahead' })).toEqual({ instruction: 'Go ahead' });
  });
});

describe('HookPayloadSchema', () => {
  it('should validate a valid hook payload', () => {
    const valid = {
      session_id: 'session-123',
      hook_event_name: 'PreToolUse' as const,
    };
    expect(HookPayloadSchema.parse(valid)).toEqual(valid);
  });

  it('should accept all optional fields', () => {
    const valid = {
      session_id: 'session-123',
      hook_event_name: 'PostToolUse' as const,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      cwd: '/tmp',
      transcript_path: '/path/to/transcript',
      permission_mode: 'default',
    };
    expect(HookPayloadSchema.parse(valid)).toEqual(valid);
  });

  it('should validate all hook event types', () => {
    const events = ['PreToolUse', 'PostToolUse', 'Notification', 'SessionEnd', 'Stop'];
    for (const event of events) {
      expect(() => HookPayloadSchema.parse({
        session_id: 'test',
        hook_event_name: event,
      })).not.toThrow();
    }
  });

  it('should reject invalid hook event type', () => {
    expect(() => HookPayloadSchema.parse({
      session_id: 'test',
      hook_event_name: 'InvalidEvent',
    })).toThrow();
  });

  it('should reject missing session_id', () => {
    expect(() => HookPayloadSchema.parse({
      hook_event_name: 'PreToolUse',
    })).toThrow();
  });
});

describe('MarketplaceMcpSchema', () => {
  it('validates a valid marketplace MCP', () => {
    const result = MarketplaceMcpSchema.safeParse({
      label: 'Notion',
      command: 'npx',
      args: ['@notionhq/notion-mcp'],
      envFile: 'mcp-notion.env',
      permissions: ['mcp__notion__*'],
      source: 'registry.modelcontextprotocol.io',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid permission pattern', () => {
    const result = MarketplaceMcpSchema.safeParse({
      label: 'Bad',
      command: 'npx',
      args: [],
      permissions: ['invalid-pattern'],
      source: 'custom',
    });
    expect(result.success).toBe(false);
  });

  it('accepts granular permissions', () => {
    const result = MarketplaceMcpSchema.safeParse({
      label: 'Notion',
      command: 'npx',
      args: [],
      permissions: ['mcp__notion__read_page'],
      source: 'custom',
    });
    expect(result.success).toBe(true);
  });

  it('accepts hyphenated MCP names', () => {
    const result = MarketplaceMcpSchema.safeParse({
      label: 'Google Drive',
      command: 'npx',
      args: [],
      permissions: ['mcp__google-drive__*'],
      source: 'custom',
    });
    expect(result.success).toBe(true);
  });
});

describe('UserSkillSchema', () => {
  it('validates a valid user skill', () => {
    const result = UserSkillSchema.safeParse({
      name: 'comptable',
      source: '/Users/alice/.claude/skills/comptable',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts tilde paths', () => {
    const result = UserSkillSchema.safeParse({
      name: 'my-skill',
      source: '~/.claude/skills/my-skill',
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects relative paths', () => {
    const result = UserSkillSchema.safeParse({
      name: 'bad',
      source: 'relative/path',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid skill names', () => {
    const result = UserSkillSchema.safeParse({
      name: 'Bad Name!',
      source: '/valid/path',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateScheduleSchema', () => {
  it('validates a once schedule with runAt', () => {
    const result = CreateScheduleSchema.safeParse({
      type: 'once',
      runAt: '2026-03-20T18:29:00Z',
      label: 'Check email',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('once');
      expect(result.data.createdBy).toBe('user');
      expect(result.data.dossierId).toBeNull();
    }
  });

  it('validates a recurring schedule with intervalMs', () => {
    const result = CreateScheduleSchema.safeParse({
      type: 'recurring',
      intervalMs: 1800000,
      label: 'Monitor BTC',
      dossierId: 'btc-monitor',
      createdBy: 'agent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intervalMs).toBe(1800000);
      expect(result.data.dossierId).toBe('btc-monitor');
    }
  });

  it('rejects once without runAt', () => {
    const result = CreateScheduleSchema.safeParse({
      type: 'once',
      label: 'Missing runAt',
    });
    expect(result.success).toBe(false);
  });

  it('rejects recurring without intervalMs', () => {
    const result = CreateScheduleSchema.safeParse({
      type: 'recurring',
      label: 'Missing interval',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty label', () => {
    const result = CreateScheduleSchema.safeParse({
      type: 'once',
      runAt: '2026-03-20T18:29:00Z',
      label: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateScheduleSchema', () => {
  it('validates partial update', () => {
    const result = UpdateScheduleSchema.safeParse({ label: 'New label' });
    expect(result.success).toBe(true);
  });

  it('validates empty object', () => {
    const result = UpdateScheduleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid intervalMs', () => {
    const result = UpdateScheduleSchema.safeParse({ intervalMs: -100 });
    expect(result.success).toBe(false);
  });
});

describe('SetupUserInfoSchema', () => {
  it('accepts valid name and language', () => {
    const result = SetupUserInfoSchema.safeParse({ name: 'Alice', language: 'en' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Alice', language: 'en' });
    }
  });

  it('rejects empty name', () => {
    const result = SetupUserInfoSchema.safeParse({ name: '', language: 'en' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid language', () => {
    const result = SetupUserInfoSchema.safeParse({ name: 'Alice', language: 'de' });
    expect(result.success).toBe(false);
  });
});