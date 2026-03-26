#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Wrapper for Camoufox MCP server.
// Reads CapSolver API key from OS keychain (if configured).
// If present: downloads + extracts the CapSolver Firefox addon, injects the API key.
// Then launches camofox-mcp.
// IMPORTANT: Only use console.error for logging. Stdout is the MCP protocol channel.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync, spawn } from 'child_process';
import { Entry } from '@napi-rs/keyring';

const SERVICE = 'opentidy';
const KEYCHAIN_ACCOUNT = 'browser-capsolverApiKey';

const ADDONS_DIR = join(process.env.HOME || '', '.camofox', 'addons');
const CAPSOLVER_DIR = join(ADDONS_DIR, 'capsolver');
const CAPSOLVER_XPI_URL = 'https://addons.mozilla.org/firefox/downloads/latest/capsolver-captcha-solver/latest.xpi';
const CONFIG_JS_PATH = join(CAPSOLVER_DIR, 'assets', 'config.js');

function readKeychainKey() {
  try {
    const entry = new Entry(SERVICE, KEYCHAIN_ACCOUNT);
    return entry.getPassword();
  } catch {
    return null;
  }
}

function setupCapsolverAddon(apiKey) {
  // Download and extract addon if not present
  if (!existsSync(join(CAPSOLVER_DIR, 'manifest.json'))) {
    console.error('[browser] Downloading CapSolver extension...');
    mkdirSync(CAPSOLVER_DIR, { recursive: true });
    const tmpXpi = join(ADDONS_DIR, 'capsolver-tmp.xpi');
    try {
      execFileSync('curl', ['-fsSL', '-o', tmpXpi, CAPSOLVER_XPI_URL], { timeout: 60_000 });
      execFileSync('unzip', ['-qo', tmpXpi, '-d', CAPSOLVER_DIR], { timeout: 30_000 });
      try { execFileSync('rm', ['-f', tmpXpi]); } catch { /* ignore */ }
      console.error('[browser] CapSolver extension extracted');
    } catch (err) {
      console.error('[browser] Failed to download CapSolver extension:', err.message);
      return; // Non-fatal, continue without addon
    }
  }

  // Inject API key into config.js (skip if already correct)
  if (existsSync(CONFIG_JS_PATH)) {
    const currentConfig = readFileSync(CONFIG_JS_PATH, 'utf-8');
    if (currentConfig.includes(`apiKey: '${apiKey}'`)) {
      return; // Already configured
    }
  }

  console.error('[browser] Injecting CapSolver API key...');
  mkdirSync(join(CAPSOLVER_DIR, 'assets'), { recursive: true });
  writeFileSync(CONFIG_JS_PATH, `export const defaultConfig = {
  apiKey: '${apiKey}',
  appId: '',
  useCapsolver: true,
  manualSolving: false,
  solvedCallback: 'captchaSolvedCallback',
  useProxy: false,
  proxyType: 'http',
  hostOrIp: '',
  port: '',
  proxyLogin: '',
  proxyPassword: '',
  enabledForBlacklistControl: false,
  blackUrlList: [],
  isInBlackList: false,
  enabledForRecaptcha: true,
  enabledForRecaptchaV3: true,
  enabledForHCaptcha: true,
  enabledForFunCaptcha: false,
  reCaptchaMode: 'click',
  hCaptchaMode: 'click',
  reCaptchaDelayTime: 0,
  hCaptchaDelayTime: 0,
  reCaptchaRepeatTimes: 10,
  reCaptcha3RepeatTimes: 10,
  hCaptchaRepeatTimes: 10,
  funCaptchaRepeatTimes: 10,
  textCaptchaRepeatTimes: 10,
  awsRepeatTimes: 10,
  reCaptcha3TaskType: 'ReCaptchaV3TaskProxyLess',
  textCaptchaSourceAttribute: 'capsolver-image-to-text-source',
  textCaptchaResultAttribute: 'capsolver-image-to-text-result',
};
`);
  console.error('[browser] CapSolver configured');
}

try {
  // Read CapSolver API key from OS keychain (NOT from env or config files)
  const capsolverKey = readKeychainKey();
  if (capsolverKey) {
    setupCapsolverAddon(capsolverKey);
  }

  // Launch camofox-mcp via npx (standard module pattern for npm-distributed MCPs)
  const mcp = spawn('npx', ['-y', 'camofox-mcp@latest'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });

  mcp.on('exit', (code) => process.exit(code ?? 1));
  process.on('SIGTERM', () => mcp.kill('SIGTERM'));
  process.on('SIGINT', () => mcp.kill('SIGINT'));

} catch (err) {
  console.error('[browser] Failed to start:', err.message);
  process.exit(1);
}
