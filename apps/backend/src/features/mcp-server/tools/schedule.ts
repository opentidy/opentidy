// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Scheduler } from '../../scheduler/scheduler.js';

export function registerScheduleTools(server: McpServer, deps: { scheduler: Scheduler }) {
  server.registerTool('schedule_create', {
    title: 'Create Schedule',
    description: 'Schedule a future action for a task (one-shot or recurring)',
    inputSchema: {
      taskId: z.string().nullable().optional().describe('Task ID, null for system tasks'),
      type: z.enum(['once', 'recurring']).describe('"once" for one-shot, "recurring" for periodic'),
      runAt: z.string().datetime().nullable().optional().describe('ISO 8601 datetime for one-shot schedules'),
      intervalMs: z.number().int().positive().nullable().optional().describe('Interval in ms for recurring schedules'),
      instruction: z.string().nullable().optional().describe('Instruction to pass to the agent when schedule fires'),
      label: z.string().min(1).describe('Human-readable label for the calendar'),
    },
  }, (args) => {
    const schedule = deps.scheduler.create({
      taskId: args.taskId ?? null,
      type: args.type,
      runAt: args.runAt ?? null,
      intervalMs: args.intervalMs ?? null,
      instruction: args.instruction ?? null,
      label: args.label,
      createdBy: 'agent',
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(schedule) }] };
  });

  server.registerTool('schedule_list', {
    title: 'List Schedules',
    description: 'List all schedules, optionally filtered by task ID',
    inputSchema: {
      taskId: z.string().optional().describe('Filter by task ID'),
    },
  }, (args) => {
    let schedules = deps.scheduler.list();
    if (args.taskId) {
      schedules = schedules.filter(s => s.taskId === args.taskId);
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(schedules) }] };
  });

  server.registerTool('schedule_delete', {
    title: 'Delete Schedule',
    description: 'Delete a schedule by ID (cannot delete system schedules)',
    inputSchema: {
      id: z.number().int().describe('Schedule ID to delete'),
    },
  }, (args) => {
    try {
      deps.scheduler.delete(args.id);
      return { content: [{ type: 'text' as const, text: `Schedule ${args.id} deleted` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  });
}
