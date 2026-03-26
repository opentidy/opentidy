// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

/**
 * Returns the system clipboard copy command for the current platform.
 * Used by tmux copy-pipe-and-cancel binding.
 */
export function getClipboardCopyCommand(): string {
  switch (process.platform) {
    case 'darwin':
      return 'pbcopy';
    case 'win32':
      return 'clip.exe';
    default:
      // Linux: prefer xclip, fall back to xsel
      return 'xclip -selection clipboard';
  }
}