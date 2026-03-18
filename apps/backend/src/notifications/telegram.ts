import type { UrgencyLevel } from '@alfred/shared';

type SendMessageFn = (chatId: string, text: string, options?: { parse_mode?: string }) => Promise<void>;

export interface NotifierDeps {
  sendMessage: SendMessageFn;
  appBaseUrl: string;
  chatId?: string;
  rateLimitMs?: number;
  notificationStore?: { record(input: { message: string; link: string; dossierId?: string }): unknown };
  sse?: { emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void };
}

export interface Notifier {
  notifyStarted(dossierId: string): Promise<void>;
  notifyMfa(dossierId: string): Promise<void>;
  notifyCompleted(dossierId: string): Promise<void>;
  notifySuggestion(title: string, urgency: UrgencyLevel): Promise<void>;
  notifyAction(dossierId: string, action: string): Promise<void>;
  notifyEscalation(dossierId: string, reason: string): Promise<void>;
  notifyIdle(dossierId: string): Promise<void>;
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

  function dossierLink(dossierId: string): string {
    return `${appBaseUrl}/dossiers/${dossierId}`;
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

  function recordAndEmit(message: string, link: string, dossierId?: string): void {
    if (notificationStore) notificationStore.record({ message, link, dossierId });
    if (sse) sse.emit({ type: 'notification:sent', data: { message, dossierId: dossierId ?? '' }, timestamp: new Date().toISOString() });
  }

  return {
    async notifyStarted(dossierId) {
      // No Telegram message for session start — just record in store for Activity Feed
      recordAndEmit(`Session démarrée`, dossierLink(dossierId), dossierId);
    },

    async notifyMfa(dossierId) {
      const text = `🔐 MFA requis pour ${dossierId}\n${dossierLink(dossierId)}`;
      await send(`mfa:${dossierId}`, text);
      recordAndEmit(`MFA requis`, dossierLink(dossierId), dossierId);
    },

    async notifyCompleted(dossierId) {
      const text = `✅ Dossier ${dossierId} terminé\n${dossierLink(dossierId)}`;
      await send(`completed:${dossierId}`, text);
      recordAndEmit(`Dossier terminé`, dossierLink(dossierId), dossierId);
    },

    async notifySuggestion(title, urgency) {
      if (urgency !== 'urgent') return;
      const text = `💡 Suggestion urgente: ${title}\n${suggestionsLink()}`;
      await send(`suggestion:${title}`, text);
      recordAndEmit(`Suggestion: ${title}`, suggestionsLink());
    },

    async notifyAction(dossierId, action) {
      const text = `ℹ️ ${dossierId}: ${action}\n${dossierLink(dossierId)}`;
      await send(`action:${dossierId}`, text);
      recordAndEmit(action, dossierLink(dossierId), dossierId);
    },

    async notifyEscalation(dossierId, reason) {
      const text = `⚠️ Escalade ${dossierId}: ${reason}\n${dossierLink(dossierId)}`;
      await send(`escalation:${dossierId}`, text);
      recordAndEmit(`Escalade: ${reason}`, dossierLink(dossierId), dossierId);
    },

    async notifyIdle(dossierId) {
      const text = `⏸️ Session ${dossierId} en attente\n${dossierLink(dossierId)}`;
      await send(`idle:${dossierId}`, text);
      recordAndEmit(`Session en attente`, dossierLink(dossierId), dossierId);
    },
  };
}
