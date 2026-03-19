// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type { AppEvent, ModuleManifest, OpenTidyConfig, ReceiverEvent } from '@opentidy/shared';

export interface WebhookDeps {
  manifests: Map<string, ModuleManifest>;
  loadConfig: () => OpenTidyConfig;
  modulesBaseDir: string;
  dedup?: { isDuplicate(content: string): boolean; record(content: string): void };
  triageHandler?: (event: AppEvent) => Promise<void>;
  transformOverride?: (body: unknown) => ReceiverEvent;
}

export function webhookRoute(deps: WebhookDeps) {
  const app = new Hono();

  app.post('/webhooks/:moduleName/:receiverName', async (c) => {
    const moduleName = c.req.param('moduleName');
    const receiverName = c.req.param('receiverName');
    console.log(`[webhook] POST /webhooks/${moduleName}/${receiverName}`);

    // 1. Check module exists and is enabled
    const config = deps.loadConfig();
    const moduleState = config.modules[moduleName];
    if (!moduleState || !moduleState.enabled) {
      return c.json({ error: 'Module not found or not enabled' }, 404);
    }

    // 2. Get manifest
    const manifest = deps.manifests.get(moduleName);
    if (!manifest) {
      return c.json({ error: 'Module manifest not found' }, 404);
    }

    // 3. Find receiver def with matching name and mode === 'webhook'
    const receiverDef = (manifest.receivers ?? []).find(
      (r) => r.name === receiverName && r.mode === 'webhook',
    );
    if (!receiverDef) {
      return c.json({ error: 'Receiver not found' }, 404);
    }

    // 4. Load transform function
    let transform: (body: unknown) => ReceiverEvent;
    if (deps.transformOverride) {
      transform = deps.transformOverride;
    } else {
      const transformPath = `${deps.modulesBaseDir}/${moduleName}/${receiverDef.transform}`;
      const mod = await import(transformPath);
      transform = mod.default ?? mod.transform;
    }

    // 5. Call transform
    const body = await c.req.json();
    const event: ReceiverEvent = transform(body);

    // 6. Dedup check
    if (deps.dedup?.isDuplicate(event.content)) {
      console.log(`[webhook] deduplicated event for ${moduleName}/${receiverName}`);
      return c.json({ accepted: true, deduplicated: true });
    }

    // 7. Record in dedup
    deps.dedup?.record(event.content);

    // 8. Wrap into AppEvent
    const contentHash = createHash('sha256').update(event.content).digest('hex');
    const appEvent: AppEvent = {
      id: randomUUID(),
      source: event.source as AppEvent['source'],
      content: event.content,
      timestamp: new Date().toISOString(),
      metadata: event.metadata,
      contentHash,
    };

    // 9. Pass to triageHandler
    await deps.triageHandler?.(appEvent);

    return c.json({ accepted: true });
  });

  return app;
}
