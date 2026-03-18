import { describe, it, expect } from 'vitest';
import { createSSEEmitter } from '../../src/sse/emitter.js';

describe('SSEEmitter', () => {
  it('broadcasts event to connected clients', () => {
    const sse = createSSEEmitter();
    const received: string[] = [];
    const mockClient = { write: (data: string) => received.push(data) };
    sse.addClient(mockClient);
    sse.emit({ type: 'session:started', data: { id: 'test' }, timestamp: new Date().toISOString() });
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('session:started');
  });

  it('removes disconnected clients', () => {
    const sse = createSSEEmitter();
    const mockClient = { write: () => { throw new Error('disconnected'); } };
    sse.addClient(mockClient);
    // Should not throw
    sse.emit({ type: 'session:ended', data: {}, timestamp: new Date().toISOString() });
    expect(sse.clientCount()).toBe(0);
  });
});
