// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { ReceiverEvent } from '@opentidy/shared';

export function createReceiver(config: Record<string, unknown>) {
  let running = false;

  return {
    type: 'whatsapp-wacli',
    async start(emit: (event: ReceiverEvent) => void) {
      running = true;
      console.log('[whatsapp] Receiver started (stub — wacli integration pending)');
      // TODO: spawn wacli process, parse output, emit events
    },
    async stop() {
      running = false;
      console.log('[whatsapp] Receiver stopped');
    },
    health() {
      return { ok: running };
    },
  };
}
