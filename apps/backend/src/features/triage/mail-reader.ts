// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFileCb);

interface MailReaderDeps {
  execFn?: (script: string) => Promise<string>;
  sinceMinutes?: number;
}

export function createMailReader(deps: MailReaderDeps = {}) {
  const sinceMinutes = deps.sinceMinutes ?? 5;

  // AppleScript reads recent emails from Mail.app (Gmail account connected)
  const script = `
    set cutoff to (current date) - ${sinceMinutes * 60}
    set output to ""
    tell application "Mail"
      set inboxMsgs to messages of inbox whose date received > cutoff
      repeat with m in inboxMsgs
        set senderAddr to extract address from sender of m
        set msgSubject to subject of m
        set msgDate to date received of m as «class isot» as string
        set msgContent to content of m
        -- Truncate long emails to first 2000 chars
        if length of msgContent > 2000 then
          set msgContent to text 1 thru 2000 of msgContent
        end if
        -- Tab-separated: from, date, subject, body (newlines replaced with ␤)
        set tidyContent to do shell script "echo " & quoted form of msgContent & " | tr '\\n' '␤' | head -c 2000"
        set output to output & senderAddr & tab & msgDate & tab & msgSubject & tab & tidyContent & linefeed
      end repeat
    end tell
    return output
  `;

  const execFn = deps.execFn ?? (async (s: string) => {
    const { stdout } = await execFileAsync('osascript', ['-e', s], { timeout: 30_000 });
    return stdout;
  });

  async function getNewMessages(): Promise<Array<{ from: string; body: string; timestamp: string }>> {
    try {
      const stdout = await execFn(script);
      if (!stdout.trim()) return [];

      return stdout
        .trim()
        .split('\n')
        .filter(line => line.includes('\t'))
        .map(line => {
          const [from, timestamp, subject, ...bodyParts] = line.split('\t');
          const body = bodyParts.join('\t').replace(/␤/g, '\n').trim();
          return {
            from: from.trim(),
            body: `${subject.trim()}\n\n${body}`,
            timestamp: timestamp.trim(),
          };
        });
    } catch (err) {
      console.error('[mail-reader] Failed to read Mail.app:', err);
      return [];
    }
  }

  return { getNewMessages };
}

// ReceiverPlugin wrapper for the plugin system
import type { ReceiverPlugin, ReceiverPluginMessage } from './plugin.js';

export function createMailReceiverPlugin(opts?: Record<string, unknown>): ReceiverPlugin {
  const reader = createMailReader({
    execFn: opts?.execFn as ((script: string) => Promise<string>) | undefined,
    sinceMinutes: (opts?.sinceMinutes as number) ?? 5,
  });
  let timer: ReturnType<typeof setInterval> | null = null;
  const interval = (opts?.pollIntervalMs as number) ?? 300_000;

  return {
    name: 'apple-mail',
    source: 'mail',
    init: () => {},
    start: (onMessage: (msg: ReceiverPluginMessage) => void) => {
      async function poll() {
        const messages = await reader.getNewMessages();
        for (const msg of messages) {
          onMessage({ from: msg.from, body: msg.body, timestamp: msg.timestamp });
        }
      }
      timer = setInterval(poll, interval);
    },
    stop: () => { if (timer) clearInterval(timer); },
  };
}
