// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd
import { GmailWebhookSchema } from '@opentidy/shared';

export function createWebhookReceiver(deps: {
  dedup: { isDuplicate: (c: string) => boolean; record: (c: string) => void };
  triage: (event: { source: string; content: string; metadata: Record<string, string> }) => Promise<void>;
}) {
  async function handleGmailWebhook(raw: unknown): Promise<{ accepted: boolean; reason?: string }> {
    // safeParse intentional: webhooks must never throw — invalid payloads return
    // { accepted: false } so the caller can respond 200 and avoid external retries.
    const parsed = GmailWebhookSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, reason: 'invalid payload' };

    const data = parsed.data;
    const content = JSON.stringify({ from: data.from, subject: data.subject, body: data.body });

    if (deps.dedup.isDuplicate(content)) {
      return { accepted: false, reason: 'duplicate' };
    }
    deps.dedup.record(content);

    console.log('[receiver] Gmail webhook accepted:', data.messageId);

    await deps.triage({
      source: 'gmail',
      content: `Email from ${data.from}: ${data.subject}\n\n${data.body}`,
      metadata: { messageId: data.messageId, threadId: data.threadId ?? '', from: data.from },
    });

    return { accepted: true };
  }

  return { handleGmailWebhook };
}
