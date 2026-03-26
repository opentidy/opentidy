// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Email receiver — polls himalaya for new unseen emails and emits events.
// Agent-agnostic: just feeds the triage pipeline, doesn't use any agent.

import { execFileSync, type ExecFileSyncOptions } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ReceiverEvent } from '@opentidy/shared';

const POLL_INTERVAL_MS = 300_000; // 5 minutes
const BREW_PATHS = ['/opt/homebrew/bin', '/usr/local/bin'];

interface HimalayaEnvelope {
  id: string;
  message_id?: string;
  flags: string[];
  from: string;
  to: string;
  subject: string;
  date: string;
  has_attachment: boolean;
}

function findHimalaya(): string {
  // Check PATH first, then common brew locations
  try {
    execFileSync('himalaya', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    return 'himalaya';
  } catch {
    const found = BREW_PATHS.map(p => join(p, 'himalaya')).find(p => existsSync(p));
    if (found) return found;
    throw new Error('himalaya not found in PATH or brew locations');
  }
}

export function createReceiver(_config: Record<string, unknown>) {
  let interval: ReturnType<typeof setInterval> | null = null;
  const seenIds = new Set<string>();

  return {
    async start(emit: (event: ReceiverEvent) => void): Promise<void> {
      const bin = findHimalaya();
      const envPath = [process.env.PATH, ...BREW_PATHS].filter(Boolean).join(':');
      const execOpts: ExecFileSyncOptions = {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
        env: { ...process.env, PATH: envPath },
      };

      console.log(`[email] Receiver started (polling every ${POLL_INTERVAL_MS / 1000}s)`);

      const poll = () => {
        try {
          const raw = execFileSync(bin, [
            'envelope', 'list',
            '--output', 'json',
            '--page-size', '20',
          ], execOpts) as unknown as string;

          const envelopes: HimalayaEnvelope[] = JSON.parse(raw);
          const unseen = envelopes.filter(e => !e.flags.includes('seen') && !seenIds.has(e.id));

          for (const env of unseen) {
            seenIds.add(env.id);
            emit({
              source: 'email',
              content: `New email from ${env.from}\nSubject: ${env.subject}\nDate: ${env.date}`,
              metadata: {
                emailId: env.id,
                from: env.from,
                to: env.to,
                subject: env.subject,
                date: env.date,
                hasAttachment: env.has_attachment,
              },
            });
          }

          // Cap the seen set to prevent unbounded growth
          if (seenIds.size > 500) {
            const arr = [...seenIds];
            arr.splice(0, arr.length - 200);
            seenIds.clear();
            arr.forEach(id => seenIds.add(id));
          }
        } catch (err) {
          console.error('[email] Poll failed:', (err as Error).message);
        }
      };

      // Initial poll after short delay, then on interval
      setTimeout(poll, 5_000);
      interval = setInterval(poll, POLL_INTERVAL_MS);
    },

    async stop(): Promise<void> {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      console.log('[email] Receiver stopped');
    },
  };
}
