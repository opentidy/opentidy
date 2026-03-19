// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { CreateScheduleSchema, UpdateScheduleSchema } from '@opentidy/shared';
import type { Scheduler } from './scheduler.js';

export interface SchedulerRouteDeps {
  scheduler: Scheduler;
}

export function schedulerRoutes(deps: SchedulerRouteDeps) {
  const app = new Hono();

  app.get('/schedules', (c) => {
    return c.json(deps.scheduler.list());
  });

  app.post('/schedules', async (c) => {
    const body = await c.req.json();
    const parsed = CreateScheduleSchema.parse(body);
    const schedule = deps.scheduler.create(parsed);
    return c.json(schedule, 201);
  });

  app.patch('/schedules/:id', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const body = await c.req.json();
    const parsed = UpdateScheduleSchema.parse(body);
    const schedule = deps.scheduler.update(id, parsed);
    return c.json(schedule);
  });

  app.delete('/schedules/:id', (c) => {
    const id = parseInt(c.req.param('id'), 10);
    deps.scheduler.delete(id);
    return c.json({ ok: true });
  });

  return app;
}
