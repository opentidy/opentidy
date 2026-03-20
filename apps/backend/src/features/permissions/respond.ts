// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';

interface RespondDeps {
  approvalManager: {
    respond(approvalId: string, approved: boolean): boolean;
    listPending(): Array<{ id: string; jobId: string; toolName: string; toolInput: Record<string, unknown>; moduleName: string | null; summary: string; createdAt: string }>;
  };
  sse: {
    emit(event: { type: string; data: Record<string, unknown>; timestamp: string }): void;
  };
}

export function permissionRespondRoute(deps: RespondDeps) {
  const router = new Hono();

  // GET /permissions/pending — list pending approvals (for web UI)
  router.get('/permissions/pending', (c) => {
    return c.json({ pending: deps.approvalManager.listPending() });
  });

  // POST /permissions/:id/approve
  router.post('/permissions/:id/approve', (c) => {
    const id = c.req.param('id');
    const found = deps.approvalManager.respond(id, true);
    if (!found) return c.json({ error: 'not found' }, 404);
    deps.sse.emit({ type: 'permission:resolved', data: { id, approved: true }, timestamp: new Date().toISOString() });
    return c.json({ ok: true });
  });

  // POST /permissions/:id/deny
  router.post('/permissions/:id/deny', (c) => {
    const id = c.req.param('id');
    const found = deps.approvalManager.respond(id, false);
    if (!found) return c.json({ error: 'not found' }, 404);
    deps.sse.emit({ type: 'permission:resolved', data: { id, approved: false }, timestamp: new Date().toISOString() });
    return c.json({ ok: true });
  });

  return router;
}
