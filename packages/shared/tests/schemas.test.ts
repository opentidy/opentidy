// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect } from 'vitest';
import {
  GmailWebhookSchema,
  CreateTaskSchema,
  TaskInstructionSchema,
  ApproveSuggestionSchema,
  HookPayloadSchema,
  UserSkillSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  SetupUserInfoSchema,
  ModuleManifestSchema,
  ModuleStateSchema,
  ReceiverDefSchema,
  MODULE_NAME_REGEX,
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

describe('CreateTaskSchema', () => {
  it('should validate with instruction', () => {
    const result = CreateTaskSchema.parse({ instruction: 'Do something' });
    expect(result.instruction).toBe('Do something');
    expect(result.confirm).toBe(false); // default
  });

  it('should accept confirm override', () => {
    const result = CreateTaskSchema.parse({ instruction: 'Do something', confirm: true });
    expect(result.confirm).toBe(true);
  });

  it('should reject empty instruction', () => {
    expect(() => CreateTaskSchema.parse({ instruction: '' })).toThrow();
  });

  it('should reject missing instruction', () => {
    expect(() => CreateTaskSchema.parse({})).toThrow();
  });
});

describe('TaskInstructionSchema', () => {
  it('should validate with instruction', () => {
    const result = TaskInstructionSchema.parse({ instruction: 'Update status' });
    expect(result.instruction).toBe('Update status');
    expect(result.confirm).toBe(false);
  });

  it('should reject empty instruction', () => {
    expect(() => TaskInstructionSchema.parse({ instruction: '' })).toThrow();
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

describe('MODULE_NAME_REGEX', () => {
  it('accepts valid module names', () => {
    expect(MODULE_NAME_REGEX.test('gmail')).toBe(true);
    expect(MODULE_NAME_REGEX.test('password-manager')).toBe(true);
    expect(MODULE_NAME_REGEX.test('my-module-123')).toBe(true);
  });

  it('rejects invalid module names', () => {
    expect(MODULE_NAME_REGEX.test('../evil')).toBe(false);
    expect(MODULE_NAME_REGEX.test('My Module')).toBe(false);
    expect(MODULE_NAME_REGEX.test('module_name')).toBe(false);
    expect(MODULE_NAME_REGEX.test('')).toBe(false);
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
      expect(result.data.taskId).toBeNull();
    }
  });

  it('validates a recurring schedule with intervalMs', () => {
    const result = CreateScheduleSchema.safeParse({
      type: 'recurring',
      intervalMs: 1800000,
      label: 'Monitor BTC',
      taskId: 'btc-monitor',
      createdBy: 'agent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intervalMs).toBe(1800000);
      expect(result.data.taskId).toBe('btc-monitor');
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

describe('ModuleManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'email',
      label: 'Email',
      description: 'Email integration via IMAP/SMTP',
      version: '1.0.0',
      receivers: [
        { name: 'email-imap', mode: 'polling', source: 'email' },
      ],
      setup: {
        authCommand: 'npx tsx ./setup.ts',
        configFields: [
          { key: 'provider', label: 'Email provider', type: 'text', required: true },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = ModuleManifestSchema.safeParse({
      label: 'Gmail',
      description: 'Gmail integration',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('accepts configField with storage: keychain', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'browser',
      label: 'Browser',
      description: 'Web browsing',
      version: '1.0.0',
      setup: {
        configFields: [
          { key: 'capsolverApiKey', label: 'CapSolver API Key', type: 'password', storage: 'keychain' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts configField without storage (defaults to config)', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'telegram',
      label: 'Telegram',
      description: 'Messaging',
      version: '1.0.0',
      setup: {
        configFields: [
          { key: 'botToken', label: 'Bot Token', type: 'password' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects configField with invalid storage value', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'test',
      label: 'Test',
      description: 'Test',
      version: '1.0.0',
      setup: {
        configFields: [
          { key: 'k', label: 'L', type: 'text', storage: 'invalid' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ModuleManifestSchema daemon', () => {
  it('accepts manifest with daemon field', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'test-daemon',
      label: 'Test Daemon',
      description: 'A test daemon module',
      version: '1.0.0',
      daemon: { entry: './daemon.ts' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects daemon with missing entry', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'test-daemon',
      label: 'Test Daemon',
      description: 'A test daemon module',
      version: '1.0.0',
      daemon: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts manifest without daemon field', () => {
    const result = ModuleManifestSchema.safeParse({
      name: 'test',
      label: 'Test',
      description: 'No daemon',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });
});

describe('ModuleStateSchema', () => {
  it('accepts a valid state', () => {
    const result = ModuleStateSchema.safeParse({
      enabled: true,
      source: 'curated',
      config: { email: 'alice@example.com' },
      health: 'ok',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.source).toBe('curated');
      expect(result.data.health).toBe('ok');
    }
  });
});

describe('ReceiverDefSchema', () => {
  it('accepts all three modes', () => {
    for (const mode of ['webhook', 'polling', 'long-running'] as const) {
      const result = ReceiverDefSchema.safeParse({
        name: `test-${mode}`,
        mode,
        source: 'test',
      });
      expect(result.success).toBe(true);
    }
  });
});