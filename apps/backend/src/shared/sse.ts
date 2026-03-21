// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { SSEEvent, SSEEventType } from '@opentidy/shared';

/** Creates an SSEEvent with the current timestamp. Reduces boilerplate at emit call sites. */
export function createSSEEvent(type: SSEEventType, data: Record<string, unknown>): SSEEvent {
  return { type, data, timestamp: new Date().toISOString() };
}

export interface SSEClient {
  write: (data: string) => void;
}

export function createSSEEmitter() {
  const clients = new Set<SSEClient>();

  function addClient(client: SSEClient): void {
    clients.add(client);
  }

  function removeClient(client: SSEClient): void {
    clients.delete(client);
  }

  function emit(event: SSEEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  }

  function clientCount(): number {
    return clients.size;
  }

  return { addClient, removeClient, emit, clientCount };
}