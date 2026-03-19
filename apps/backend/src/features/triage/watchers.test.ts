// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// src/features/triage/watchers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWatcher } from './watchers.js';

describe('Watcher', () => {
  let dedup: { isDuplicate: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> };
  let triage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dedup = {
      isDuplicate: vi.fn().mockReturnValue(false),
      record: vi.fn(),
    };
    triage = vi.fn().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // E2E-RCV-04: WhatsApp watcher routes to dossier
  it('polls and triages WhatsApp messages', async () => {
    const messages = [
      { from: '+15551234567', body: 'Salut, voici le doc', timestamp: '2026-03-14T10:00:00Z' },
    ];
    const getNewMessages = vi.fn().mockResolvedValue(messages);

    const watcher = createWatcher(
      { pollIntervalMs: 5000, source: 'whatsapp', getNewMessages },
      { dedup, triage },
    );

    await watcher.poll();

    expect(triage).toHaveBeenCalledOnce();
    expect(triage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'whatsapp',
        content: expect.stringContaining('+15551234567'),
        metadata: expect.objectContaining({ from: '+15551234567' }),
      }),
    );
    expect(dedup.record).toHaveBeenCalledOnce();
  });

  // E2E-RCV-05: SMS watcher creates suggestion
  it('polls and triages SMS messages', async () => {
    const messages = [
      { from: '+15559876543', body: 'Votre colis est en route', timestamp: '2026-03-14T11:00:00Z' },
    ];
    const getNewMessages = vi.fn().mockResolvedValue(messages);

    const watcher = createWatcher(
      { pollIntervalMs: 10000, source: 'sms', getNewMessages },
      { dedup, triage },
    );

    await watcher.poll();

    expect(triage).toHaveBeenCalledOnce();
    expect(triage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'sms',
        content: expect.stringContaining('+15559876543'),
      }),
    );
  });

  it('skips duplicate messages', async () => {
    dedup.isDuplicate.mockReturnValue(true);
    const messages = [
      { from: '+15551234567', body: 'dupe', timestamp: '2026-03-14T10:00:00Z' },
    ];
    const getNewMessages = vi.fn().mockResolvedValue(messages);

    const watcher = createWatcher(
      { pollIntervalMs: 5000, source: 'whatsapp', getNewMessages },
      { dedup, triage },
    );

    await watcher.poll();

    expect(triage).not.toHaveBeenCalled();
    expect(dedup.record).not.toHaveBeenCalled();
  });

  it('processes multiple messages in one poll', async () => {
    const messages = [
      { from: 'alice', body: 'msg1', timestamp: '2026-03-14T10:00:00Z' },
      { from: 'bob', body: 'msg2', timestamp: '2026-03-14T10:01:00Z' },
    ];
    const getNewMessages = vi.fn().mockResolvedValue(messages);

    const watcher = createWatcher(
      { pollIntervalMs: 5000, source: 'whatsapp', getNewMessages },
      { dedup, triage },
    );

    await watcher.poll();

    expect(triage).toHaveBeenCalledTimes(2);
    expect(dedup.record).toHaveBeenCalledTimes(2);
  });

  it('handles empty poll result', async () => {
    const getNewMessages = vi.fn().mockResolvedValue([]);

    const watcher = createWatcher(
      { pollIntervalMs: 5000, source: 'sms', getNewMessages },
      { dedup, triage },
    );

    await watcher.poll();

    expect(triage).not.toHaveBeenCalled();
  });

  it('start/stop controls the polling interval', () => {
    const getNewMessages = vi.fn().mockResolvedValue([]);

    const watcher = createWatcher(
      { pollIntervalMs: 5000, source: 'whatsapp', getNewMessages },
      { dedup, triage },
    );

    watcher.start();
    vi.advanceTimersByTime(15000);
    expect(getNewMessages).toHaveBeenCalledTimes(3);

    watcher.stop();
    vi.advanceTimersByTime(10000);
    // No more calls after stop
    expect(getNewMessages).toHaveBeenCalledTimes(3);
  });
});