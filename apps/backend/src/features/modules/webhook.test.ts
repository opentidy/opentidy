// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, vi } from 'vitest';
import { webhookRoute } from './webhook.js';
import type { AppEvent, ModuleManifest, OpenTidyConfig, ReceiverEvent } from '@opentidy/shared';
import type { WebhookDeps } from './webhook.js';

function makeConfig(overrides: Partial<OpenTidyConfig> = {}): OpenTidyConfig {
  return {
    version: 1,
    auth: { bearerToken: 'test-token' },
    server: { port: 3000, appBaseUrl: 'http://localhost:3000' },
    workspace: { dir: '/tmp/workspace', lockDir: '/tmp/locks' },
    update: { autoUpdate: false, checkInterval: '6h', notifyBeforeUpdate: false, delayBeforeUpdate: '0', keepReleases: 2 },
    agentConfig: { name: 'claude', configDir: '/tmp/claude' },
    language: 'en',
    modules: {},
    userInfo: { name: 'Test User', email: 'test@example.com', company: 'Test Co' },
    ...overrides,
  };
}

function makeManifest(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    name: 'github',
    label: 'GitHub',
    description: 'GitHub integration',
    version: '1.0.0',
    receivers: [
      { name: 'push', mode: 'webhook', source: 'github', transform: 'transform.js' },
      { name: 'poller', mode: 'polling', source: 'github' },
    ],
    ...overrides,
  };
}

function mockTransform(body: unknown): ReceiverEvent {
  return {
    source: 'github',
    content: `push event: ${JSON.stringify(body)}`,
    metadata: { ref: 'refs/heads/main' },
  };
}

function makeDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  const manifests = new Map<string, ModuleManifest>();
  manifests.set('github', makeManifest());

  return {
    manifests,
    loadConfig: vi.fn(() => makeConfig({
      modules: { github: { enabled: true, source: 'curated' } },
    })),
    modulesBaseDir: '/tmp/modules',
    transformOverride: mockTransform,
    triageHandler: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function postWebhook(app: ReturnType<typeof webhookRoute>, module: string, receiver: string, body: unknown = {}) {
  return app.request(`/webhooks/${module}/${receiver}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('webhookRoute', () => {
  it('returns 200 and calls triageHandler for a valid webhook', async () => {
    const deps = makeDeps();
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'github', 'push', { ref: 'refs/heads/main' });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual({ accepted: true });
    expect(deps.triageHandler).toHaveBeenCalledOnce();

    const calledWith = (deps.triageHandler as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppEvent;
    expect(calledWith.source).toBe('github');
    expect(calledWith.content).toContain('push event');
    expect(calledWith.id).toBeTruthy();
    expect(calledWith.timestamp).toBeTruthy();
    expect(calledWith.contentHash).toBeTruthy();
    expect(calledWith.metadata).toEqual({ ref: 'refs/heads/main' });
  });

  it('returns 404 for unknown module', async () => {
    const deps = makeDeps();
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'nonexistent', 'push');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 for disabled module', async () => {
    const deps = makeDeps({
      loadConfig: vi.fn(() => makeConfig({
        modules: { github: { enabled: false, source: 'curated' } },
      })),
    });
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'github', 'push');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 for unknown receiver', async () => {
    const deps = makeDeps();
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'github', 'nonexistent-receiver');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 for non-webhook receiver (polling mode)', async () => {
    const deps = makeDeps();
    const app = webhookRoute(deps);

    // 'poller' is mode: 'polling', not 'webhook'
    const res = await postWebhook(app, 'github', 'poller');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 200 with deduplicated: true for duplicate content', async () => {
    const deps = makeDeps({
      dedup: {
        isDuplicate: vi.fn(() => true),
        record: vi.fn(),
      },
    });
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'github', 'push', { ref: 'refs/heads/main' });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual({ accepted: true, deduplicated: true });
  });

  it('skips triageHandler for deduplicated events', async () => {
    const triageHandler = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      triageHandler,
      dedup: {
        isDuplicate: vi.fn(() => true),
        record: vi.fn(),
      },
    });
    const app = webhookRoute(deps);

    await postWebhook(app, 'github', 'push', { ref: 'refs/heads/main' });

    expect(triageHandler).not.toHaveBeenCalled();
  });

  it('records content in dedup after successful processing', async () => {
    const record = vi.fn();
    const deps = makeDeps({
      dedup: {
        isDuplicate: vi.fn(() => false),
        record,
      },
    });
    const app = webhookRoute(deps);

    await postWebhook(app, 'github', 'push', { ref: 'refs/heads/main' });

    expect(record).toHaveBeenCalledOnce();
  });

  it('returns 404 when module config is missing entirely', async () => {
    const deps = makeDeps({
      loadConfig: vi.fn(() => makeConfig({ modules: {} })),
    });
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'github', 'push');

    expect(res.status).toBe(404);
  });

  it('returns 404 when manifest is missing for an enabled module', async () => {
    const manifests = new Map<string, ModuleManifest>();
    // No manifest for 'github', but config says it's enabled
    const deps = makeDeps({ manifests });
    const app = webhookRoute(deps);

    const res = await postWebhook(app, 'github', 'push');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/manifest not found/i);
  });
});
