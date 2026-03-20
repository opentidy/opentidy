// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { AppDeps } from '../../server.js';

export function downloadJobRoute(deps: AppDeps) {
  const app = new Hono();

  app.get('/job/:id/artifact/:filename', (c) => {
    const id = c.req.param('id');
    const filename = c.req.param('filename');
    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return c.json({ error: 'invalid filename' }, 400);
    }
    const filePath = join(deps.workspaceDir, id, 'artifacts', filename);
    if (!existsSync(filePath)) {
      return c.json({ error: 'not found' }, 404);
    }
    const buffer = readFileSync(filePath);
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      md: 'text/markdown',
    };
    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    const isText = contentType.startsWith('text/') || contentType === 'application/json';
    return new Response(buffer, {
      headers: {
        'Content-Type': isText ? `${contentType}; charset=utf-8` : contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  });

  return app;
}
