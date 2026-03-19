// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { generateServiceFile } from '../shared/platform/service-installer.js';
import { getOpenTidyPaths } from '../shared/paths.js';

export async function runInstallService(): Promise<void> {
  const paths = getOpenTidyPaths();
  const nodePath = process.execPath;
  const cliPath = process.argv[1];

  const result = generateServiceFile({
    platform: process.platform,
    nodePath,
    cliPath,
    logDir: paths.log,
  });

  mkdirSync(dirname(result.installPath), { recursive: true });
  mkdirSync(paths.log, { recursive: true });
  writeFileSync(result.installPath, result.content);
  console.log(`Service file written to: ${result.installPath}`);
  console.log(`\nTo activate:\n${result.instructions}`);
}