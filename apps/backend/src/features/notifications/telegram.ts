// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { UrgencyLevel } from '@opentidy/shared';

type SendMessageFn = (chatId: string, text: string, options?: { parse_mode?: string }) => Promise<void>;

export interface NotifierDeps {
  sendMessage: SendMessageFn;
  appBaseUrl: string;
  chatId?: string;
  rateLimitMs?: number;
  notificationStore?: { record(input: { message: string; link: string; taskId?: string }): unknown };
  sse?: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
}

export interface Notifier {
  notifyStarted(taskId: string): Promise<void>;
  notifyMfa(taskId: string): Promise<void>;
  notifyCompleted(taskId: string): Promise<void>;
  notifySuggestion(title: string, urgency: UrgencyLevel): Promise<void>;
  notifyAction(taskId: string, action: string): Promise<void>;
  notifyEscalation(taskId: string, reason: string): Promise<void>;
  notifyIdle(taskId: string): Promise<void>;
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

  function taskLink(taskId: string): string {
    return `${appBaseUrl}/tasks/${taskId}`;
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

  function recordAndEmit(message: string, link: string, taskId?: string): void {
    if (notificationStore) notificationStore.record({ message, link, taskId });
    if (sse) sse.emit({ type: 'notification:sent', data: { message, taskId: taskId ?? '' }, timestamp: new Date().toISOString() });
  }

  return {
    async notifyStarted(taskId) {
      // No Telegram message for session start — just record in store for Activity Feed
      recordAndEmit(`Session started`, taskLink(taskId), taskId);
    },

    async notifyMfa(taskId) {
      const text = `🔐 MFA required for ${taskId}\n${taskLink(taskId)}`;
      await send(`mfa:${taskId}`, text);
      recordAndEmit(`MFA required`, taskLink(taskId), taskId);
    },

    async notifyCompleted(taskId) {
      const text = `✅ Task ${taskId} completed\n${taskLink(taskId)}`;
      await send(`completed:${taskId}`, text);
      recordAndEmit(`Task completed`, taskLink(taskId), taskId);
    },

    async notifySuggestion(title, urgency) {
      if (urgency !== 'urgent') return;
      const text = `💡 Urgent suggestion: ${title}\n${suggestionsLink()}`;
      await send(`suggestion:${title}`, text);
      recordAndEmit(`Suggestion: ${title}`, suggestionsLink());
    },

    async notifyAction(taskId, action) {
      const text = `ℹ️ ${taskId}: ${action}\n${taskLink(taskId)}`;
      await send(`action:${taskId}`, text);
      recordAndEmit(action, taskLink(taskId), taskId);
    },

    async notifyEscalation(taskId, reason) {
      const text = `⚠️ Escalation ${taskId}: ${reason}\n${taskLink(taskId)}`;
      await send(`escalation:${taskId}`, text);
      recordAndEmit(`Escalation: ${reason}`, taskLink(taskId), taskId);
    },

    async notifyIdle(taskId) {
      const text = `⏸️ Session ${taskId} idle\n${taskLink(taskId)}`;
      await send(`idle:${taskId}`, text);
      recordAndEmit(`Session idle`, taskLink(taskId), taskId);
    },
  };
}