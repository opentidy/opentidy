// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ReceiverEvent } from '@opentidy/shared';

export function createReceiver(config: Record<string, unknown>) {
  return {
    type: 'imessage',
    async poll(): Promise<ReceiverEvent[]> {
      console.log('[imessage] Polling Messages.app (stub, osascript integration pending)');
      // TODO: use execFileSync('osascript', ...) to read recent messages
      return [];
    },
    health() {
      return { ok: process.platform === 'darwin' };
    },
  };
}
