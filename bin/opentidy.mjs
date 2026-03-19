#!/usr/bin/env node
// Cross-platform CLI entry point for npm global install.
// On macOS/Homebrew, bin/opentidy (shell) is used instead.
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve dist/cli.js relative to this file
const candidates = [
  resolve(__dirname, '../dist/cli.js'),                          // npm global
  resolve(__dirname, '../apps/backend/dist/cli.js'),             // dev mode
  resolve(__dirname, '../libexec/dist/cli.js'),                  // homebrew
];

const cliPath = candidates.find(p => existsSync(p));

if (!cliPath) {
  console.error('Error: Cannot find dist/cli.js. Run "pnpm build" first.');
  process.exit(1);
}

await import(cliPath);
