// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../../shared/config.js';
import { ask, run, info, success, warn } from './utils.js';

function writeCloudflaredConfig(
  cfConfigPath: string,
  cfConfigDir: string,
  tunnelName: string,
  hostname: string,
  port: number,
): void {
  const cfConfig = `tunnel: ${tunnelName}
credentials-file: ${cfConfigDir}/${tunnelName}.json

ingress:
  - hostname: ${hostname || 'opentidy.example.com'}
    service: http://localhost:${port}
  - service: http_status:404
`;
  writeFileSync(cfConfigPath, cfConfig);
  success(`Config written to ${cfConfigPath}`);
}

export async function setupTunnel(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);
  const port = config.server.port || 5175;

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Cloudflare Tunnel                   │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('A Cloudflare Tunnel lets you access OpenTidy from anywhere');
  info('without opening ports on your router. Free, secure, fast.');
  console.log('');
  info('Prerequisites:');
  info('  - A free Cloudflare account');
  info('  - A domain added to Cloudflare (e.g. yourdomain.com)');
  info('  - cloudflared installed (brew install cloudflared)');
  console.log('');

  if (!run('cloudflared', ['--version'])) {
    warn('cloudflared not found. Install it: brew install cloudflared');
    return;
  }

  // --- Step A: Login ---
  if (!existsSync(`${process.env.HOME}/.cloudflared/cert.pem`)) {
    console.log('  Step A: Login to Cloudflare');
    console.log('');
    info('A browser will open with your Cloudflare domains.');
    info('');
    info('  ┌──────────────────────────────────────────────────┐');
    info('  │  SELECT THE DOMAIN you want for OpenTidy.          │');
    info('  │  Example: if you want opentidy.yourdomain.com,      │');
    info('  │  click on "yourdomain.com" in the list.           │');
    info('  └──────────────────────────────────────────────────┘');
    info('');
    await ask('  Press Enter to open the browser...');
    try {
      execFileSync('cloudflared', ['tunnel', 'login'], { stdio: 'inherit', timeout: 120_000 });
      console.log('');
      success('Logged into Cloudflare.');
    } catch {
      warn('Login failed. Run manually: cloudflared tunnel login');
      return;
    }
  } else {
    success('Already logged into Cloudflare.');
  }

  // --- Step B: Create tunnel ---
  console.log('');
  console.log('  Step B: Create a tunnel');
  info('A tunnel is a persistent secure connection to Cloudflare.');
  console.log('');
  const tunnelName = await ask('  Tunnel name (Enter = "opentidy"): ') || 'opentidy';

  const existingTunnels = run('cloudflared', ['tunnel', 'list', '--output', 'json']);
  const tunnelExists = existingTunnels.includes(`"${tunnelName}"`);

  if (!tunnelExists) {
    info(`Creating tunnel "${tunnelName}"...`);
    try {
      execFileSync('cloudflared', ['tunnel', 'create', tunnelName], { stdio: 'inherit', timeout: 30_000 });
      success(`Tunnel "${tunnelName}" created.`);
    } catch {
      warn(`Failed. Run manually: cloudflared tunnel create ${tunnelName}`);
    }
  } else {
    success(`Tunnel "${tunnelName}" already exists.`);
  }

  // --- Step C: DNS ---
  console.log('');
  console.log('  Step C: DNS route');
  info('Choose the hostname people will use to reach OpenTidy.');
  info('This must be a subdomain of the domain you selected');
  info('during login (e.g. opentidy.yourdomain.com).');
  console.log('');
  const hostname = await ask('  Hostname (e.g. opentidy.yourdomain.com): ');
  if (hostname) {
    info(`Creating DNS route: ${hostname} → tunnel "${tunnelName}"...`);
    try {
      execFileSync('cloudflared', ['tunnel', 'route', 'dns', tunnelName, hostname], { stdio: 'inherit', timeout: 30_000 });
      success(`${hostname} is now routed to the tunnel.`);
    } catch {
      warn('Failed. Add a CNAME record manually in Cloudflare DNS:');
      info(`  ${hostname} → ${tunnelName}.cfargotunnel.com`);
    }
  }

  // --- Step D: Config file ---
  console.log('');
  const cfConfigDir = `${process.env.HOME}/.cloudflared`;
  mkdirSync(cfConfigDir, { recursive: true });
  const cfConfigPath = join(cfConfigDir, 'config.yml');

  if (existsSync(cfConfigPath)) {
    info(`Config already exists: ${cfConfigPath}`);
    const overwrite = await ask('  Overwrite? (y/N) ');
    if (overwrite.toLowerCase() !== 'y') {
      success('Keeping existing config.');
    } else {
      writeCloudflaredConfig(cfConfigPath, cfConfigDir, tunnelName, hostname, port);
    }
  } else {
    writeCloudflaredConfig(cfConfigPath, cfConfigDir, tunnelName, hostname, port);
  }

  // --- Step E: Service ---
  console.log('');
  console.log('  Step D: Background service');
  info('Install cloudflared as a launchd service so the tunnel');
  info('runs automatically on boot (even without logging in).');
  console.log('');
  const installService = await ask('  Install as background service? (Y/n) ');
  if (installService.toLowerCase() !== 'n') {
    try {
      execFileSync('cloudflared', ['service', 'install'], { stdio: 'inherit', timeout: 30_000 });
      success('Tunnel service installed (starts on boot).');
    } catch {
      warn('Failed. Run manually: cloudflared service install');
    }
  }
}
