// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  fetchLatestWaWebVersion,
  type WASocket,
} from '@whiskeysockets/baileys';
import Database from 'better-sqlite3';
import { join } from 'path';
import { readFile } from 'fs/promises';
import type { ModuleContext } from '@opentidy/shared';

let sock: WASocket | null = null;
let db: Database.Database | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_RECONNECT = 12;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_FACTOR = 1.8;

export async function start(ctx: ModuleContext): Promise<void> {
  db = new Database(join(ctx.dataDir, 'whatsapp.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  initSchema(db);

  await connect(ctx);
  registerTools(ctx);

  ctx.onShutdown(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    sock?.end();
    db?.close();
  });
}

export async function stop(): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  sock?.end();
  sock = null;
  db?.close();
  db = null;
  reconnectAttempts = 0;
}

export function health(): { ok: boolean; error?: string } {
  if (!sock) return { ok: false, error: 'Not connected' };
  return { ok: true };
}

// --- Connection ---

async function connect(ctx: ModuleContext): Promise<void> {
  const authDir = join(ctx.dataDir, 'auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestWaWebVersion();

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys),
    },
    version,
    browser: Browsers.appropriate('Desktop'),
    syncFullHistory: true,
  });

  // Baileys v7 uses a buffered event system. sock.ev.process() is the
  // correct API — it listens to the 'event' meta-event and processes
  // buffered events after the initial sync flushes.
  sock.ev.process(async (events: Record<string, any>) => {
    if (events['connection.update']) {
      handleConnectionUpdate(events['connection.update'], ctx);
    }
    if (events['creds.update']) {
      saveCreds();
    }
    if (events['messaging-history.set']) {
      const histData = events['messaging-history.set'];
      const { chats, messages, contacts } = histData;
      ctx.logger.log(`History sync: ${chats?.length ?? 0} chats, ${messages?.length ?? 0} msgs, ${contacts?.length ?? 0} contacts`);
      if (chats?.length > 0) ctx.logger.log(`First chat keys: ${JSON.stringify(Object.keys(chats[0])).slice(0, 200)}`);
      if (messages?.length > 0) ctx.logger.log(`First msg keys: ${JSON.stringify(Object.keys(messages[0])).slice(0, 200)}`);
      if (db) {
        try {
          const transaction = db.transaction(() => {
            if (chats?.length) syncChats(chats);
            if (messages?.length) syncMessages(messages);
            if (contacts?.length) syncContacts(contacts);
          });
          transaction();
          ctx.logger.log(`DB after sync: chats=${db.prepare('SELECT COUNT(*) as c FROM chats').get()?.c}, msgs=${db.prepare('SELECT COUNT(*) as c FROM messages').get()?.c}`);
        } catch (err) {
          ctx.logger.error(`DB sync error: ${(err as Error).message}`);
        }
      }
    }
    if (events['chats.upsert']) {
      const chats = events['chats.upsert'];
      ctx.logger.log(`chats.upsert: ${chats.length} chats`);
      syncChats(chats);
    }
    if (events['chats.update']) {
      const updates = events['chats.update'];
      ctx.logger.log(`chats.update: ${updates.length} updates`);
      if (db) {
        for (const update of updates) {
          if (!update.id) continue;
          const contactName = resolveContactName(update.id);
          db.prepare('INSERT OR IGNORE INTO chats (jid, name) VALUES (?, ?)').run(update.id, contactName || update.id);
          if (update.name) db.prepare('UPDATE chats SET name = ? WHERE jid = ?').run(update.name, update.id);
          const ts = toNumber(update.conversationTimestamp);
          if (ts) {
            db.prepare('UPDATE chats SET last_message_at = ? WHERE jid = ?').run(String(ts), update.id);
          }
          if (update.unreadCount !== undefined) {
            db.prepare('UPDATE chats SET unread_count = ? WHERE jid = ?').run(update.unreadCount, update.id);
          }
        }
      }
    }
    if (events['contacts.upsert']) {
      const contacts = events['contacts.upsert'];
      syncContacts(contacts);
    }
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      // Persist all messages to SQLite
      for (const msg of messages) persistMessage(msg);
      // Only emit to triage for real-time notifications
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const text = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || '[media]';
          const sender = msg.key.remoteJid || 'unknown';
          ctx.emit({
            source: 'whatsapp',
            content: text,
            metadata: {
              from: sender,
              messageId: msg.key.id || '',
              timestamp: String(msg.messageTimestamp || ''),
              pushName: msg.pushName || '',
            },
          });
        }
      }
    }
  });
}

function handleConnectionUpdate(update: any, ctx: ModuleContext): void {
  const { connection, lastDisconnect, qr } = update;
  if (qr) {
    ctx.logger.log('QR code generated — waiting for scan');
    ctx.emitSSE({
      type: 'module:auth-required',
      data: { name: 'whatsapp', qr },
      timestamp: new Date().toISOString(),
    });
  }
  if (connection === 'open') {
    reconnectAttempts = 0;
    ctx.logger.log('Connected to WhatsApp');
    ctx.emitSSE({
      type: 'module:auth-complete',
      data: { name: 'whatsapp' },
      timestamp: new Date().toISOString(),
    });
  }
  if (connection === 'close') {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
    if (statusCode === DisconnectReason.loggedOut) {
      ctx.logger.error('WhatsApp logged out — re-auth required');
      return;
    }
    if (reconnectAttempts < MAX_RECONNECT) {
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(RECONNECT_FACTOR, reconnectAttempts),
        RECONNECT_MAX_MS,
      );
      reconnectAttempts++;
      ctx.logger.warn(`Disconnected, reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})`);
      reconnectTimer = setTimeout(() => connect(ctx), delay);
    } else {
      ctx.logger.error(`Max reconnect attempts (${MAX_RECONNECT}) reached`);
    }
  }
}

// --- SQLite schema and persistence ---

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      unread_count INTEGER DEFAULT 0,
      last_message_at TEXT,
      metadata TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      sender TEXT,
      content TEXT,
      timestamp INTEGER,
      from_me INTEGER DEFAULT 0,
      media_type TEXT,
      metadata TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS contacts (
      jid TEXT PRIMARY KEY,
      name TEXT,
      notify TEXT,
      phone TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content, chat_jid, sender,
      content='messages',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, chat_jid, sender)
      VALUES (new.rowid, new.content, new.chat_jid, new.sender);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, chat_jid, sender)
      VALUES ('delete', old.rowid, old.content, old.chat_jid, old.sender);
    END;
  `);
}

/** Convert protobuf Long/object timestamps to plain number */
function toNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'object' && val !== null && 'low' in val) return Number((val as any).low);
  return Number(val) || null;
}

function persistMessage(msg: any): void {
  if (!db) return;
  const content = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || '';
  db.prepare(`
    INSERT OR REPLACE INTO messages (id, chat_jid, sender, content, timestamp, from_me, media_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(msg.key.id ?? ''),
    String(msg.key.remoteJid ?? ''),
    String(msg.key.participant || msg.key.remoteJid || ''),
    content,
    toNumber(msg.messageTimestamp),
    msg.key.fromMe ? 1 : 0,
    msg.message ? Object.keys(msg.message)[0] : null,
  );
}

function resolveContactName(jid: string): string | null {
  if (!db) return null;
  const row = db.prepare('SELECT name, notify FROM contacts WHERE jid = ?').get(jid) as { name?: string; notify?: string } | undefined;
  return row?.name || row?.notify || null;
}

function syncChats(chats: any[]): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO chats (jid, name, unread_count, last_message_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const chat of chats) {
    const jid = String(chat.id ?? '');
    if (!jid) continue;
    const name = chat.name || resolveContactName(jid) || jid;
    const ts = toNumber(chat.conversationTimestamp);
    stmt.run(jid, name, Number(chat.unreadCount) || 0, ts ? String(ts) : null);
  }
}

function syncMessages(messages: any[]): void {
  for (const msg of messages) persistMessage(msg);
}

function syncContacts(contacts: any[]): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contacts (jid, name, notify, phone)
    VALUES (?, ?, ?, ?)
  `);
  for (const contact of contacts) {
    const jid = String(contact.id ?? '');
    if (!jid) continue;
    stmt.run(jid, contact.name ? String(contact.name) : null, contact.notify ? String(contact.notify) : null, null);
  }
}

// --- MCP tools ---

function registerTools(ctx: ModuleContext): void {
  ctx.registerTool('whatsapp_list_chats', {
    description: 'List WhatsApp conversations',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max chats to return', default: 20 },
      },
    },
  }, async (input) => {
    if (!db) throw new Error('WhatsApp database not initialized');
    const limit = (input.limit as number) || 20;
    return db.prepare('SELECT jid, name, unread_count, last_message_at FROM chats ORDER BY last_message_at DESC LIMIT ?').all(limit);
  });

  ctx.registerTool('whatsapp_read_messages', {
    description: 'Read messages from a WhatsApp chat',
    inputSchema: {
      type: 'object',
      properties: {
        chatJid: { type: 'string', description: 'Chat JID' },
        limit: { type: 'number', description: 'Max messages', default: 50 },
      },
      required: ['chatJid'],
    },
  }, async (input) => {
    if (!db) throw new Error('WhatsApp database not initialized');
    return db.prepare('SELECT id, sender, content, timestamp, from_me, media_type FROM messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT ?')
      .all(input.chatJid, (input.limit as number) || 50);
  });

  ctx.registerTool('whatsapp_search', {
    description: 'Search WhatsApp messages by text',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        chatJid: { type: 'string', description: 'Optional: limit to one chat' },
        limit: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  }, async (input) => {
    if (!db) throw new Error('WhatsApp database not initialized');
    const query = (input.query as string || '').trim();
    if (!query) return [];
    if (input.chatJid) {
      return db.prepare('SELECT m.id, m.chat_jid, m.sender, m.content, m.timestamp FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE f.content MATCH ? AND m.chat_jid = ? ORDER BY m.timestamp DESC LIMIT ?')
        .all(query, input.chatJid, (input.limit as number) || 20);
    }
    return db.prepare('SELECT m.id, m.chat_jid, m.sender, m.content, m.timestamp FROM messages m JOIN messages_fts f ON m.rowid = f.rowid WHERE f.content MATCH ? ORDER BY m.timestamp DESC LIMIT ?')
      .all(query, (input.limit as number) || 20);
  });

  ctx.registerTool('whatsapp_send_message', {
    description: 'Send a text message on WhatsApp',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient JID or phone number' },
        text: { type: 'string', description: 'Message text' },
      },
      required: ['to', 'text'],
    },
  }, async (input) => {
    if (!sock) throw new Error('WhatsApp not connected');
    const result = await sock.sendMessage(input.to as string, { text: input.text as string });
    return { sent: true, messageId: result?.key?.id };
  });

  ctx.registerTool('whatsapp_send_media', {
    description: 'Send a media file on WhatsApp. Path must be absolute. Media type inferred from extension if not specified.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient JID' },
        filePath: { type: 'string', description: 'Absolute path to the file' },
        caption: { type: 'string', description: 'Optional caption' },
        mediaType: { type: 'string', enum: ['image', 'video', 'document', 'audio'], default: 'document' },
      },
      required: ['to', 'filePath'],
    },
  }, async (input) => {
    if (!sock) throw new Error('WhatsApp not connected');
    const buffer = await readFile(input.filePath as string);
    const type = (input.mediaType as string) || 'document';
    const msg: Record<string, unknown> = { [type]: buffer };
    if (input.caption) msg.caption = input.caption;
    const result = await sock.sendMessage(input.to as string, msg);
    return { sent: true, messageId: result?.key?.id };
  });
}
