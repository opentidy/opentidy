// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type {
  OpenTidyConfig,
  ModuleManifest,
  ModuleState,
  ReceiverEvent,
  AppEvent,
  SSEEvent,
} from '@opentidy/shared';

export interface ModuleLifecycleDeps {
  loadConfig: () => OpenTidyConfig;
  saveConfig: (config: OpenTidyConfig) => void;
  manifests: Map<string, ModuleManifest>;
  regenerateAgentConfig: (
    modules: Record<string, ModuleState>,
    manifests: Map<string, ModuleManifest>,
  ) => void;
  triageHandler?: (event: AppEvent) => Promise<void>;
  dedup?: { isDuplicate(content: string): boolean; record(content: string): void };
  sse?: { emit(event: SSEEvent): void };
}

interface ActiveReceiver {
  stop(): Promise<void>;
}

export function createModuleLifecycle(deps: ModuleLifecycleDeps) {
  const { loadConfig, saveConfig, manifests, regenerateAgentConfig, triageHandler, dedup, sse } =
    deps;

  // Active receiver instances keyed by `${moduleName}:${receiverName}`
  const activeReceivers = new Map<string, ActiveReceiver>();

  function emitSSE(event: SSEEvent): void {
    sse?.emit(event);
  }

  async function startReceivers(name: string): Promise<void> {
    const manifest = manifests.get(name);
    if (!manifest?.receivers?.length) return;

    const config = loadConfig();
    const moduleConfig = config.modules[name]?.config ?? {};

    for (const receiverDef of manifest.receivers) {
      if (receiverDef.mode === 'webhook') {
        // Webhook receivers are handled by the HTTP endpoint — no process to start
        console.log(`[modules] Receiver ${name}:${receiverDef.name} is webhook-mode, skipping start`);
        continue;
      }

      if (!receiverDef.entry) {
        console.warn(`[modules] Receiver ${name}:${receiverDef.name} has no entry file, skipping`);
        continue;
      }

      const key = `${name}:${receiverDef.name}`;

      try {
        // Dynamic import to allow mocking in tests
        const mod = await import(receiverDef.entry);
        const receiver = mod.createReceiver(moduleConfig) as {
          start(emit: (event: ReceiverEvent) => void): Promise<void>;
          stop(): Promise<void>;
        };

        const emit = (receiverEvent: ReceiverEvent): void => {
          const appEvent: AppEvent = {
            id: crypto.randomUUID(),
            source: receiverEvent.source as AppEvent['source'],
            content: receiverEvent.content,
            timestamp: new Date().toISOString(),
            metadata: receiverEvent.metadata,
            contentHash: '',
          };

          if (dedup) {
            if (dedup.isDuplicate(appEvent.content)) {
              console.log(`[modules] Duplicate event from ${name}:${receiverDef.name}, skipping`);
              return;
            }
            dedup.record(appEvent.content);
          }

          triageHandler?.(appEvent).catch((err: unknown) => {
            console.error(`[modules] triageHandler error for ${name}:${receiverDef.name}:`, (err as Error).message);
          });
        };

        await receiver.start(emit);
        activeReceivers.set(key, receiver);
        console.log(`[modules] Started receiver ${key}`);
      } catch (err) {
        console.error(`[modules] Failed to start receiver ${key}:`, (err as Error).message);
      }
    }
  }

  async function stopReceivers(name: string): Promise<void> {
    const toStop: Array<[string, ActiveReceiver]> = [];

    for (const [key, receiver] of activeReceivers) {
      if (key.startsWith(`${name}:`)) {
        toStop.push([key, receiver]);
      }
    }

    for (const [key, receiver] of toStop) {
      try {
        await receiver.stop();
        console.log(`[modules] Stopped receiver ${key}`);
      } catch (err) {
        console.error(`[modules] Failed to stop receiver ${key}:`, (err as Error).message);
      }
      activeReceivers.delete(key);
    }
  }

  async function enable(name: string): Promise<void> {
    console.log(`[modules] Enabling module: ${name}`);

    const config = loadConfig();
    if (!config.modules[name]) {
      config.modules[name] = { enabled: false, source: 'curated' };
    }
    config.modules[name].enabled = true;
    saveConfig(config);

    regenerateAgentConfig(config.modules, manifests);

    await startReceivers(name);

    emitSSE({ type: 'module:enabled', data: { name }, timestamp: new Date().toISOString() });
  }

  async function disable(name: string): Promise<void> {
    console.log(`[modules] Disabling module: ${name}`);

    await stopReceivers(name);

    const config = loadConfig();
    if (!config.modules[name]) {
      config.modules[name] = { enabled: false, source: 'curated' };
    }
    config.modules[name].enabled = false;
    saveConfig(config);

    regenerateAgentConfig(config.modules, manifests);

    emitSSE({ type: 'module:disabled', data: { name }, timestamp: new Date().toISOString() });
  }

  async function configure(name: string, configValues: Record<string, unknown>): Promise<void> {
    console.log(`[modules] Configuring module: ${name}`);

    const config = loadConfig();
    if (!config.modules[name]) {
      config.modules[name] = { enabled: false, source: 'curated' };
    }
    config.modules[name].config = {
      ...(config.modules[name].config ?? {}),
      ...configValues,
    };
    saveConfig(config);

    if (config.modules[name].enabled) {
      regenerateAgentConfig(config.modules, manifests);
    }

    emitSSE({ type: 'module:configured', data: { name }, timestamp: new Date().toISOString() });
  }

  async function stopAll(): Promise<void> {
    console.log('[modules] Stopping all receivers');
    const keys = [...activeReceivers.keys()];
    for (const key of keys) {
      const receiver = activeReceivers.get(key);
      if (!receiver) continue;
      try {
        await receiver.stop();
        console.log(`[modules] Stopped receiver ${key}`);
      } catch (err) {
        console.error(`[modules] Failed to stop receiver ${key}:`, (err as Error).message);
      }
      activeReceivers.delete(key);
    }
  }

  return { enable, disable, configure, startReceivers, stopReceivers, stopAll };
}
