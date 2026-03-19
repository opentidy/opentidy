// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

/**
 * Shared raw-mode input loop for interactive CLI menus.
 * Handles arrow keys, j/k, Enter, Space, q/Ctrl-C.
 */
export function createRawModeSelector(opts: {
  totalItems: number;
  initialCursor?: number;
  render: (cursor: number) => void;
  onSpace?: (cursor: number) => void;
}): Promise<{ cursor: number; action: 'select' | 'cancel' }> {
  return new Promise((resolve) => {
    let cursor = opts.initialCursor ?? 0;

    opts.render(cursor);

    const stdin = process.stdin;
    if (!stdin.isTTY) {
      resolve({ cursor, action: 'select' });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onKey);
      process.stdout.write('\x1B[2J\x1B[H');
    };

    const onKey = (key: string) => {
      if (key === '\x1B[A' || key === 'k') {
        cursor = (cursor - 1 + opts.totalItems) % opts.totalItems;
        opts.render(cursor);
      } else if (key === '\x1B[B' || key === 'j') {
        cursor = (cursor + 1) % opts.totalItems;
        opts.render(cursor);
      } else if (key === ' ' && opts.onSpace) {
        opts.onSpace(cursor);
        opts.render(cursor);
      } else if (key === '\r' || key === '\n') {
        cleanup();
        resolve({ cursor, action: 'select' });
      } else if (key === 'q' || key === '\x03') {
        cleanup();
        resolve({ cursor, action: 'cancel' });
      }
    };

    stdin.on('data', onKey);
  });
}
