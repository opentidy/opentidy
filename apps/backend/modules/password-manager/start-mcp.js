#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Wrapper script for Bitwarden MCP server.
// Reads master password from OS keychain → bw unlock → sets BW_SESSION → runs MCP server.
// IMPORTANT: Only use console.error for logging — stdout is the MCP protocol channel.

import { Entry } from '@napi-rs/keyring';
import { execFileSync, spawn } from 'child_process';
import { createRequire } from 'module';

const SERVICE = 'opentidy';
const ACCOUNT = 'bitwarden-master-password';

try {
  // 1. Read master password from OS keychain
  const entry = new Entry(SERVICE, ACCOUNT);
  const masterPassword = entry.getPassword();
  if (!masterPassword) {
    console.error('[password-manager] No master password in keychain. Run: opentidy setup');
    process.exit(1);
  }

  // 2. Unlock vault and get fresh session token
  const sessionToken = execFileSync('bw', ['unlock', '--passwordenv', 'OPENTIDY_BW_MASTER', '--raw'], {
    env: { ...process.env, OPENTIDY_BW_MASTER: masterPassword },
    encoding: 'utf-8',
    timeout: 30_000,
  }).trim();

  if (!sessionToken) {
    console.error('[password-manager] bw unlock returned empty session token');
    process.exit(1);
  }

  // 3. Spawn the Bitwarden MCP server binary directly with BW_SESSION.
  // npx doesn't forward stdin/stdout properly for MCP protocol,
  // so we resolve the binary path and run it with node directly.
  const require = createRequire(import.meta.url);
  const mcpBin = require.resolve('@bitwarden/mcp-server/dist/index.js');

  const mcp = spawn(process.execPath, [mcpBin], {
    env: { ...process.env, BW_SESSION: sessionToken },
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  mcp.on('exit', (code) => process.exit(code ?? 1));
  process.on('SIGTERM', () => mcp.kill('SIGTERM'));
  process.on('SIGINT', () => mcp.kill('SIGINT'));

} catch (err) {
  console.error('[password-manager] Failed to start:', /** @type {Error} */ (err).message);
  process.exit(1);
}
