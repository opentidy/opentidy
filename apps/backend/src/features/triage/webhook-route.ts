// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';

// Hono route — POST /webhook/gmail
export function webhookGmailRoute(deps: { receiver: { handleGmailWebhook(body: unknown): Promise<{ accepted: boolean; reason?: string }> } }) {
  const router = new Hono();
  router.post('/webhook/gmail', async (c) => {
    const body = await c.req.json();
    const result = await deps.receiver.handleGmailWebhook(body);
    return c.json(result);
  });
  return router;
}
