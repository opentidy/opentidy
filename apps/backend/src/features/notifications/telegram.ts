// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { UrgencyLevel } from '@opentidy/shared';

type SendMessageFn = (chatId: string, text: string, options?: { parse_mode?: string }) => Promise<void>;

export interface NotifierDeps {
  sendMessage: SendMessageFn;
  appBaseUrl: string;
  chatId?: string;
  rateLimitMs?: number;
  notificationStore?: { record(input: { message: string; link: string; jobId?: string }): unknown };
  sse?: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
}

export interface Notifier {
  notifyStarted(jobId: string): Promise<void>;
  notifyMfa(jobId: string): Promise<void>;
  notifyCompleted(jobId: string): Promise<void>;
  notifySuggestion(title: string, urgency: UrgencyLevel): Promise<void>;
  notifyAction(jobId: string, action: string): Promise<void>;
  notifyEscalation(jobId: string, reason: string): Promise<void>;
  notifyIdle(jobId: string): Promise<void>;
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;
const DEFAULT_RATE_LIMIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const { sendMessage, appBaseUrl, chatId = '', rateLimitMs = DEFAULT_RATE_LIMIT_MS, notificationStore, sse } = deps;

  // Anti-spam: track last send time per "type:key"
  const lastSent = new Map<string, number>();

  function jobLink(jobId: string): string {
    return `${appBaseUrl}/jobs/${jobId}`;
  }

  function suggestionsLink(): string {
    return `${appBaseUrl}/suggestions`;
  }

  function isRateLimited(key: string): boolean {
    const last = lastSent.get(key);
    if (last === undefined) return false;
    return Date.now() - last < rateLimitMs;
  }

  function markSent(key: string): void {
    lastSent.set(key, Date.now());
  }

  async function sendWithRetry(text: string): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          await sleep(delayMs);
        }
        await sendMessage(chatId, text, { parse_mode: 'HTML' });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[notifications] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError.message);
      }
    }

    throw lastError;
  }

  async function send(rateLimitKey: string, text: string): Promise<void> {
    if (isRateLimited(rateLimitKey)) {
      console.log(`[notifications] Rate limited: ${rateLimitKey}`);
      return;
    }
    markSent(rateLimitKey);
    await sendWithRetry(text);
  }

  function recordAndEmit(message: string, link: string, jobId?: string): void {
    if (notificationStore) notificationStore.record({ message, link, jobId });
    if (sse) sse.emit({ type: 'notification:sent', data: { message, jobId: jobId ?? '' }, timestamp: new Date().toISOString() });
  }

  return {
    async notifyStarted(jobId) {
      // No Telegram message for session start — just record in store for Activity Feed
      recordAndEmit(`Session started`, jobLink(jobId), jobId);
    },

    async notifyMfa(jobId) {
      const text = `🔐 MFA required for ${jobId}\n${jobLink(jobId)}`;
      await send(`mfa:${jobId}`, text);
      recordAndEmit(`MFA required`, jobLink(jobId), jobId);
    },

    async notifyCompleted(jobId) {
      const text = `✅ Job ${jobId} completed\n${jobLink(jobId)}`;
      await send(`completed:${jobId}`, text);
      recordAndEmit(`Job completed`, jobLink(jobId), jobId);
    },

    async notifySuggestion(title, urgency) {
      if (urgency !== 'urgent') return;
      const text = `💡 Urgent suggestion: ${title}\n${suggestionsLink()}`;
      await send(`suggestion:${title}`, text);
      recordAndEmit(`Suggestion: ${title}`, suggestionsLink());
    },

    async notifyAction(jobId, action) {
      const text = `ℹ️ ${jobId}: ${action}\n${jobLink(jobId)}`;
      await send(`action:${jobId}`, text);
      recordAndEmit(action, jobLink(jobId), jobId);
    },

    async notifyEscalation(jobId, reason) {
      const text = `⚠️ Escalation ${jobId}: ${reason}\n${jobLink(jobId)}`;
      await send(`escalation:${jobId}`, text);
      recordAndEmit(`Escalation: ${reason}`, jobLink(jobId), jobId);
    },

    async notifyIdle(jobId) {
      const text = `⏸️ Session ${jobId} idle\n${jobLink(jobId)}`;
      await send(`idle:${jobId}`, text);
      recordAndEmit(`Session idle`, jobLink(jobId), jobId);
    },
  };
}