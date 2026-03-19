// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ReceiverEvent } from '@opentidy/shared';

export function transform(body: unknown): ReceiverEvent {
  const payload = body as Record<string, unknown>;
  const message = (payload.message ?? payload) as Record<string, unknown>;

  return {
    source: 'gmail',
    content: String(message.snippet ?? message.body ?? JSON.stringify(body)),
    metadata: {
      from: String(message.from ?? ''),
      subject: String(message.subject ?? ''),
      timestamp: new Date().toISOString(),
    },
  };
}
