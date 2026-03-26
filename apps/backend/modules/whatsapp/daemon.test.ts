// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';

// Mock Baileys before importing daemon
vi.mock('@whiskeysockets/baileys', () => {
  const DisconnectReason = { loggedOut: 401 };
  return {
    makeWASocket: vi.fn(),
    useMultiFileAuthState: vi.fn(),
    makeCacheableSignalKeyStore: vi.fn((keys: any) => keys),
    Browsers: { appropriate: vi.fn(() => ['Desktop', '', '']) },
    fetchLatestWaWebVersion: vi.fn().mockResolvedValue({ version: [2, 2413, 1] }),
    DisconnectReason,
  };
});

import { start, stop } from './daemon.js';
import type { ModuleContext } from '@opentidy/shared';

function createMockSocket() {
  let processHandler: ((events: Record<string, any>) => void) | null = null;
  return {
    ev: {
      on: vi.fn(),
      process: (handler: (events: Record<string, any>) => void) => {
        processHandler = handler;
      },
    },
    end: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'msg-sent-123' } }),
    _emit: (event: string, data: any) => {
      if (processHandler) processHandler({ [event]: data });
    },
  };
}

function createMockContext(tmpDir: string, overrides: Partial<ModuleContext> = {}): ModuleContext & { emitCalls: any[]; tools: Map<string, any>; shutdownFns: Array<() => void | Promise<void>> } {
  const emitCalls: any[] = [];
  const tools = new Map<string, any>();
  const shutdownFns: Array<() => void | Promise<void>> = [];

  return {
    config: {},
    dataDir: tmpDir,
    emit: (event) => emitCalls.push(event),
    emitSSE: vi.fn(),
    registerTool: (name, schema, handler) => tools.set(name, { schema, handler }),
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    onShutdown: (fn) => shutdownFns.push(fn),
    emitCalls,
    tools,
    shutdownFns,
    ...overrides,
  };
}

describe('WhatsApp daemon', () => {
  let tmpDir: string;
  let mockSock: ReturnType<typeof createMockSocket>;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opentidy-wa-daemon-'));
    mkdirSync(join(tmpDir, 'auth'), { recursive: true });

    mockSock = createMockSocket();

    const baileys = await import('@whiskeysockets/baileys');
    (baileys.makeWASocket as any).mockReturnValue(mockSock);
    (baileys.useMultiFileAuthState as any).mockResolvedValue({
      state: { creds: {}, keys: {} },
      saveCreds: vi.fn(),
    });
  });

  afterEach(async () => {
    await stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes SQLite schema on start', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    const db = new Database(join(tmpDir, 'whatsapp.db'));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('chats');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('contacts');
    expect(tableNames).toContain('messages_fts');
    db.close();
  });

  it('registers 5 MCP tools', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    expect(ctx.tools.size).toBe(5);
    expect(ctx.tools.has('whatsapp_list_chats')).toBe(true);
    expect(ctx.tools.has('whatsapp_read_messages')).toBe(true);
    expect(ctx.tools.has('whatsapp_search')).toBe(true);
    expect(ctx.tools.has('whatsapp_send_message')).toBe(true);
    expect(ctx.tools.has('whatsapp_send_media')).toBe(true);
  });

  it('emits ReceiverEvent on messages.upsert (type: notify)', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    mockSock._emit('messages.upsert', {
      type: 'notify',
      messages: [{
        key: { id: 'msg-1', remoteJid: '1234@s.whatsapp.net', fromMe: false },
        message: { conversation: 'Hello from test' },
        messageTimestamp: 1234567890,
        pushName: 'Alice',
      }],
    });

    expect(ctx.emitCalls).toHaveLength(1);
    expect(ctx.emitCalls[0].source).toBe('whatsapp');
    expect(ctx.emitCalls[0].content).toBe('Hello from test');
    expect(ctx.emitCalls[0].metadata.from).toBe('1234@s.whatsapp.net');
  });

  it('does NOT emit on messages.upsert (type: append — history sync)', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    mockSock._emit('messages.upsert', {
      type: 'append',
      messages: [{
        key: { id: 'msg-old', remoteJid: '1234@s.whatsapp.net', fromMe: false },
        message: { conversation: 'Old history message' },
        messageTimestamp: 1000000000,
      }],
    });

    expect(ctx.emitCalls).toHaveLength(0);
  });

  it('does NOT emit on fromMe messages', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    mockSock._emit('messages.upsert', {
      type: 'notify',
      messages: [{
        key: { id: 'msg-me', remoteJid: '1234@s.whatsapp.net', fromMe: true },
        message: { conversation: 'I sent this' },
        messageTimestamp: 1234567890,
      }],
    });

    expect(ctx.emitCalls).toHaveLength(0);
  });

  it('whatsapp_send_message calls sock.sendMessage', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    const handler = ctx.tools.get('whatsapp_send_message').handler;
    const result = await handler({ to: '1234@s.whatsapp.net', text: 'Test message' });
    expect(result).toEqual({ sent: true, messageId: 'msg-sent-123' });
    expect(mockSock.sendMessage).toHaveBeenCalledWith('1234@s.whatsapp.net', { text: 'Test message' });
  });

  it('stop() cleans up socket and database', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);

    await stop();
    expect(mockSock.end).toHaveBeenCalled();
  });

  it('registers onShutdown handler', async () => {
    const ctx = createMockContext(tmpDir);
    await start(ctx);
    expect(ctx.shutdownFns.length).toBeGreaterThan(0);
  });
});
