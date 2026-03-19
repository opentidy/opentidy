// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// src/features/triage/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookReceiver } from './webhook.js';

describe('WebhookReceiver', () => {
  const validGmailPayload = {
    from: 'billing@example-client.com',
    to: 'user@example.com',
    subject: 'Facture Mars 2026',
    body: 'Veuillez trouver ci-joint la facture.',
    messageId: 'msg-123',
    threadId: 'thread-456',
    timestamp: '2026-03-14T10:00:00Z',
  };

  let dedup: { isDuplicate: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> };
  let triage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dedup = {
      isDuplicate: vi.fn().mockReturnValue(false),
      record: vi.fn(),
    };
    triage = vi.fn().mockResolvedValue(undefined);
  });

  // E2E-RCV-01: Gmail webhook accepted and triaged
  it('accepts valid Gmail webhook and calls triage', async () => {
    const receiver = createWebhookReceiver({ dedup, triage });
    const result = await receiver.handleGmailWebhook(validGmailPayload);

    expect(result.accepted).toBe(true);
    expect(dedup.record).toHaveBeenCalledOnce();
    expect(triage).toHaveBeenCalledOnce();
    expect(triage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'gmail',
        content: expect.stringContaining('billing@example-client.com'),
        metadata: expect.objectContaining({ messageId: 'msg-123' }),
      }),
    );
  });

  it('rejects invalid Gmail webhook payload', async () => {
    const receiver = createWebhookReceiver({ dedup, triage });
    const result = await receiver.handleGmailWebhook({ bad: 'data' });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('invalid payload');
    expect(triage).not.toHaveBeenCalled();
  });

  // E2E-RCV-03: dedup rejects duplicate
  it('rejects duplicate webhook', async () => {
    dedup.isDuplicate.mockReturnValue(true);
    const receiver = createWebhookReceiver({ dedup, triage });
    const result = await receiver.handleGmailWebhook(validGmailPayload);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('duplicate');
    expect(dedup.record).not.toHaveBeenCalled();
    expect(triage).not.toHaveBeenCalled();
  });

  it('accepts webhook without optional threadId', async () => {
    const { threadId: _, ...noThread } = validGmailPayload;
    const receiver = createWebhookReceiver({ dedup, triage });
    const result = await receiver.handleGmailWebhook(noThread);

    expect(result.accepted).toBe(true);
    expect(triage).toHaveBeenCalledOnce();
  });

  it('passes correct content format to triage', async () => {
    const receiver = createWebhookReceiver({ dedup, triage });
    await receiver.handleGmailWebhook(validGmailPayload);

    const triageCall = triage.mock.calls[0][0];
    expect(triageCall.content).toBe(
      'Email de billing@example-client.com: Facture Mars 2026\n\nVeuillez trouver ci-joint la facture.',
    );
  });

  it('records content before calling triage', async () => {
    const callOrder: string[] = [];
    dedup.record.mockImplementation(() => callOrder.push('record'));
    triage.mockImplementation(async () => callOrder.push('triage'));

    const receiver = createWebhookReceiver({ dedup, triage });
    await receiver.handleGmailWebhook(validGmailPayload);

    expect(callOrder).toEqual(['record', 'triage']);
  });
});