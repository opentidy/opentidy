// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { z } from 'zod';
import type { OpenTidyConfig } from '@opentidy/shared';
import type { Scheduler } from '../scheduler/scheduler.js';

const SCAN_INTERVAL_MS: Record<string, number> = {
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '6h': 21_600_000,
};

const PreferencesSchema = z.object({
  language: z.enum(['en', 'fr']).optional(),
  autoUpdate: z.boolean().optional(),
  scanInterval: z.enum(['30m', '1h', '2h', '6h', 'disabled']).optional(),
  notificationRateLimit: z.number().refine(v => [0, 60_000, 300_000].includes(v)).optional(),
});

export interface PreferencesDeps {
  loadConfig: () => OpenTidyConfig;
  saveConfig: (config: OpenTidyConfig) => void;
  scheduler?: Scheduler;
}

export function preferencesRoute(deps: PreferencesDeps) {
  const app = new Hono();

  app.get('/settings/preferences', (c) => {
    const config = deps.loadConfig();
    return c.json({
      language: config.language ?? 'en',
      autoUpdate: config.update?.autoUpdate ?? true,
      scanInterval: config.preferences?.scanInterval ?? '2h',
      notificationRateLimit: config.preferences?.notificationRateLimit ?? 60_000,
    });
  });

  app.put('/settings/preferences', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const parsed = PreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
    }

    const config = deps.loadConfig();
    const data = parsed.data;

    if (data.language !== undefined) {
      config.language = data.language;
    }
    if (data.autoUpdate !== undefined) {
      config.update.autoUpdate = data.autoUpdate;
    }
    if (data.scanInterval !== undefined) {
      if (!config.preferences) config.preferences = { scanInterval: '2h', notificationRateLimit: 60_000 };
      config.preferences.scanInterval = data.scanInterval;

      // Update the system schedule in the DB
      if (deps.scheduler) {
        const schedules = deps.scheduler.list();
        const systemSchedule = schedules.find(s => s.createdBy === 'system' && s.label === 'Workspace checkup');
        if (systemSchedule) {
          if (data.scanInterval === 'disabled') {
            deps.scheduler.disableSystem(systemSchedule.id);
          } else {
            const ms = SCAN_INTERVAL_MS[data.scanInterval];
            deps.scheduler.updateSystem(systemSchedule.id, ms);
          }
        }
      }
    }
    if (data.notificationRateLimit !== undefined) {
      if (!config.preferences) config.preferences = { scanInterval: '2h', notificationRateLimit: 60_000 };
      config.preferences.notificationRateLimit = data.notificationRateLimit;
    }

    deps.saveConfig(config);
    console.log('[settings] Preferences updated:', data);

    return c.json({
      language: config.language,
      autoUpdate: config.update.autoUpdate,
      scanInterval: config.preferences?.scanInterval ?? '2h',
      notificationRateLimit: config.preferences?.notificationRateLimit ?? 60_000,
    });
  });

  return app;
}
