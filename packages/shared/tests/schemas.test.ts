import { describe, it, expect } from 'vitest';
import {
  GmailWebhookSchema,
  CreateDossierSchema,
  DossierInstructionSchema,
  ApproveSuggestionSchema,
  HookPayloadSchema,
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
