// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ReceiverEvent } from '@opentidy/shared';

export function createReceiver(config: Record<string, unknown>) {
  return {
    type: 'apple-mail',
    async poll(): Promise<ReceiverEvent[]> {
      console.log('[apple-mail] Polling Mail.app (stub — osascript integration pending)');
      // TODO: use execFileSync('osascript', ...) to read recent emails
      return [];
    },
    health() {
      return { ok: process.platform === 'darwin' };
    },
  };
}
