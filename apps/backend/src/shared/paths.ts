// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import envPaths from 'env-paths';
import os from 'os';
import path from 'path';

export interface OpenTidyPaths {
  config: string;   // ~/.config/opentidy (Linux/macOS) or %APPDATA%\opentidy (Windows)
  data: string;     // ~/.local/share/opentidy (Linux) or ~/Library/Application Support/opentidy (macOS)
  log: string;      // ~/.local/state/opentidy (Linux) or ~/Library/Logs/opentidy (macOS)
  cache: string;    // ~/.cache/opentidy (Linux) or ~/Library/Caches/opentidy (macOS)
  temp: string;           // $TMPDIR/opentidy or /tmp/opentidy (Unix) or %TEMP%\opentidy (Windows)
  lockDir: string;        // temp/locks
  customModules: string;  // config/modules — user-created modules
}

// env-paths is computed at module load — env overrides are read per-call in getOpenTidyPaths()
const defaults = envPaths('opentidy', { suffix: '' });

// Override config path: always use ~/.config/opentidy/ (XDG standard)
// env-paths on macOS returns ~/Library/Preferences/ which diverges from setup and CLI conventions
const xdgConfigDir = path.join(os.homedir(), '.config', 'opentidy');

export function getOpenTidyPaths(): OpenTidyPaths {
  const config = process.env.OPENTIDY_CONFIG_DIR || xdgConfigDir;
  const data = process.env.OPENTIDY_DATA_DIR || defaults.data;
  const log = process.env.OPENTIDY_LOG_DIR || defaults.log;
  const cache = process.env.OPENTIDY_CACHE_DIR || defaults.cache;
  const temp = path.join(os.tmpdir(), 'opentidy');
  const lockDir = path.join(temp, 'locks');

  const customModules = path.join(config, 'modules');

  return { config, data, log, cache, temp, lockDir, customModules };
}