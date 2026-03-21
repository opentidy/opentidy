// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';

interface TunnelStatus {
  installed: boolean;
  configured: boolean;
  hostname: string | null;
  tunnelName: string | null;
  serviceRunning: boolean;
}

function parseCloudflaredConfig(): { hostname: string | null; tunnelName: string | null } {
  const configPath = join(process.env.HOME ?? '', '.cloudflared', 'config.yml');
  if (!existsSync(configPath)) return { hostname: null, tunnelName: null };

  try {
    const content = readFileSync(configPath, 'utf-8');
    let hostname: string | null = null;
    let tunnelName: string | null = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('tunnel:')) {
        tunnelName = trimmed.replace('tunnel:', '').trim();
      }
      if (trimmed.startsWith('- hostname:')) {
        hostname = trimmed.replace('- hostname:', '').trim();
      }
    }

    return { hostname, tunnelName };
  } catch {
    return { hostname: null, tunnelName: null };
  }
}

function isCloudflaredInstalled(): boolean {
  try {
    execFileSync('which', ['cloudflared'], { timeout: 3000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isServiceRunning(): boolean {
  try {
    const result = execFileSync('launchctl', ['list'], {
      timeout: 3000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return result.includes('cloudflared');
  } catch {
    return false;
  }
}

export function tunnelStatusRoute() {
  const app = new Hono();

  app.get('/settings/tunnel', (c) => {
    console.log('[system] GET /settings/tunnel');

    const installed = isCloudflaredInstalled();
    const configPath = join(process.env.HOME ?? '', '.cloudflared', 'config.yml');
    const configured = existsSync(configPath);
    const { hostname, tunnelName } = parseCloudflaredConfig();
    const serviceRunning = configured ? isServiceRunning() : false;

    const status: TunnelStatus = {
      installed,
      configured,
      hostname,
      tunnelName,
      serviceRunning,
    };

    return c.json(status);
  });

  return app;
}
