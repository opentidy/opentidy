// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNotifier } from './telegram.js';

interface SentMessage {
  chatId: string;
  text: string;
  parseMode?: string;
}

function createMockSendMessage() {
  const sent: SentMessage[] = [];
  const fn = vi.fn(async (chatId: string, text: string, options?: { parse_mode?: string }) => {
    sent.push({ chatId, text, parseMode: options?.parse_mode });
  });
  return { fn, sent };
}

describe('Notifier', () => {
  let mock: ReturnType<typeof createMockSendMessage>;
  let notifier: ReturnType<typeof createNotifier>;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = createMockSendMessage();
    notifier = createNotifier({
      sendMessage: mock.fn,
      appBaseUrl: 'https://opentidy.example.com',
    });
  });

  // notifyStarted records to store without sending Telegram message
  it('notifyStarted records notification without sending Telegram message', async () => {
    const store = { record: vi.fn() };
    const sseMock = { emit: vi.fn() };
    const notifierWithStore = createNotifier({
      sendMessage: mock.fn,
      appBaseUrl: 'https://opentidy.example.com',
      notificationStore: store,
      sse: sseMock,
    });

    await notifierWithStore.notifyStarted('impots-2025');

    // No Telegram message sent
    expect(mock.fn).not.toHaveBeenCalled();

    // But notification is recorded in store
    expect(store.record).toHaveBeenCalledWith({
      message: 'Session started',
      link: 'https://opentidy.example.com/jobs/impots-2025',
      jobId: 'impots-2025',
    });

    // And SSE event emitted
    expect(sseMock.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notification:sent' }),
    );
  });

  // E2E-NTF-02: MFA → notification
  it('notifyMfa sends MFA required message with link', async () => {
    await notifier.notifyMfa('banque-lcl');

    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].text).toContain('MFA');
    expect(mock.sent[0].text).toContain('banque-lcl');
    expect(mock.sent[0].text).toContain('https://opentidy.example.com/jobs/banque-lcl');
  });

  // E2E-NTF-03: Job terminé → notification
  it('notifyCompleted sends completion message with link', async () => {
    await notifier.notifyCompleted('impots-2025');

    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].text).toContain('impots-2025');
    expect(mock.sent[0].text).toContain('completed');
    expect(mock.sent[0].text).toContain('https://opentidy.example.com/jobs/impots-2025');
  });

  // E2E-NTF-04: Suggestion urgente → notification
  it('notifySuggestion sends notification for urgent suggestions', async () => {
    await notifier.notifySuggestion('Renouveler passeport', 'urgent');

    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].text).toContain('Renouveler passeport');
    expect(mock.sent[0].text).toContain('Urgent suggestion');
    expect(mock.sent[0].text).toContain('https://opentidy.example.com/suggestions');
  });

  // E2E-NTF-05: Suggestion normale → PAS de notification
  it('notifySuggestion does NOT send for normal urgency', async () => {
    await notifier.notifySuggestion('Organize invoices', 'normal');
    expect(mock.sent).toHaveLength(0);
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it('notifySuggestion does NOT send for low urgency', async () => {
    await notifier.notifySuggestion('Check subscription', 'low');
    expect(mock.sent).toHaveLength(0);
    expect(mock.fn).not.toHaveBeenCalled();
  });

  // E2E-NTF-06: Action externe → notification informative
  it('notifyAction sends informative action message', async () => {
    await notifier.notifyAction('impots-2025', 'Email sent to contact@example-client.com');

    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].text).toContain('impots-2025');
    expect(mock.sent[0].text).toContain('Email sent to contact@example-client.com');
    expect(mock.sent[0].text).toContain('https://opentidy.example.com/jobs/impots-2025');
  });

  // E2E-NTF-06 bis: Escalation
  it('notifyEscalation sends escalation message with reason', async () => {
    await notifier.notifyEscalation('impots-2025', 'Suspicious amount > 5000EUR');

    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].text).toContain('Escalation');
    expect(mock.sent[0].text).toContain('impots-2025');
    expect(mock.sent[0].text).toContain('Suspicious amount > 5000EUR');
    expect(mock.sent[0].text).toContain('https://opentidy.example.com/jobs/impots-2025');
  });

  // E2E-NTF-07: Notification contient lien
  it('all job notifications contain a link to the job', async () => {
    await notifier.notifyMfa('d1');
    await notifier.notifyCompleted('d2');
    await notifier.notifyAction('d3', 'action');
    await notifier.notifyEscalation('d4', 'reason');

    expect(mock.sent).toHaveLength(4);
    expect(mock.sent[0].text).toContain('https://opentidy.example.com/jobs/d1');
    expect(mock.sent[1].text).toContain('https://opentidy.example.com/jobs/d2');
    expect(mock.sent[2].text).toContain('https://opentidy.example.com/jobs/d3');
    expect(mock.sent[3].text).toContain('https://opentidy.example.com/jobs/d4');
  });

  // E2E-NTF-08: Retry avec backoff
  describe('retry with exponential backoff', () => {
    it('retries 3 times on failure then succeeds', async () => {
      let callCount = 0;
      const failTwice = vi.fn(async () => {
        callCount++;
        if (callCount <= 2) throw new Error('Network error');
      });

      const retryNotifier = createNotifier({
        sendMessage: failTwice,
        appBaseUrl: 'https://opentidy.example.com',
      });

      const promise = retryNotifier.notifyCompleted('test-job');

      // Advance past 1st retry delay (1s)
      await vi.advanceTimersByTimeAsync(1000);
      // Advance past 2nd retry delay (2s)
      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      expect(failTwice).toHaveBeenCalledTimes(3);
    });

    it('throws after 3 failed attempts', async () => {
      const alwaysFail = vi.fn(async () => {
        throw new Error('Permanent failure');
      });

      const failNotifier = createNotifier({
        sendMessage: alwaysFail,
        appBaseUrl: 'https://opentidy.example.com',
      });

      const promise = failNotifier.notifyCompleted('test-job');
      // Attach catch immediately to avoid unhandled rejection
      let caughtError: Error | undefined;
      const handled = promise.catch((err: Error) => { caughtError = err; });

      // Advance through all retry delays: 1s + 2s + 4s
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await handled;
      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toBe('Permanent failure');
      expect(alwaysFail).toHaveBeenCalledTimes(3);
    });

    it('uses exponential backoff delays (1s, 2s, 4s)', async () => {
      const timestamps: number[] = [];
      const alwaysFail = vi.fn(async () => {
        timestamps.push(Date.now());
        throw new Error('fail');
      });

      const failNotifier = createNotifier({
        sendMessage: alwaysFail,
        appBaseUrl: 'https://opentidy.example.com',
      });

      const promise = failNotifier.notifyCompleted('d1');
      // Attach catch immediately to avoid unhandled rejection
      const handled = promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await handled;

      expect(timestamps).toHaveLength(3);
      // 1st retry after 1s
      expect(timestamps[1] - timestamps[0]).toBe(1000);
      // 2nd retry after 2s
      expect(timestamps[2] - timestamps[1]).toBe(2000);
    });
  });

  // E2E-NTF-09: Anti-spam
  describe('anti-spam rate limiting', () => {
    it('blocks duplicate notification for same jobId + type within 60s', async () => {
      await notifier.notifyMfa('impots-2025');
      await notifier.notifyMfa('impots-2025');

      expect(mock.sent).toHaveLength(1);
      expect(mock.sent[0].text).toContain('MFA');
    });

    it('allows same type for different jobIds', async () => {
      await notifier.notifyMfa('job-a');
      await notifier.notifyMfa('job-b');

      expect(mock.sent).toHaveLength(2);
    });

    it('allows different types for same jobId', async () => {
      await notifier.notifyMfa('impots-2025');
      await notifier.notifyCompleted('impots-2025');

      expect(mock.sent).toHaveLength(2);
    });

    it('allows same notification after 60s cooldown', async () => {
      await notifier.notifyMfa('impots-2025');

      // Advance 61 seconds
      vi.advanceTimersByTime(61_000);

      await notifier.notifyMfa('impots-2025');

      expect(mock.sent).toHaveLength(2);
      expect(mock.sent[1].text).toContain('MFA');
    });

    it('suggestion anti-spam uses title as key', async () => {
      await notifier.notifySuggestion('Urgent thing', 'urgent');
      await notifier.notifySuggestion('Urgent thing', 'urgent');

      expect(mock.sent).toHaveLength(1);
    });
  });
});