// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { join } from 'path';
import { rmSync } from 'fs';
import type {
  OpenTidyConfig,
  ModuleManifest,
  ModuleState,
  ReceiverEvent,
  AppEvent,
  SSEEvent,
} from '@opentidy/shared';
import { createModuleContext } from './daemon.js';
import type { DynamicToolRegistry } from '../mcp-server/dynamic-tools.js';

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
  /** Base directory for curated modules — used to resolve receiver entry paths */
  modulesBaseDir?: string;
  dynamicToolRegistry?: DynamicToolRegistry;
  modulesDataBaseDir?: string;
  keychain?: {
    setPassword(moduleName: string, key: string, value: string): void;
    getPassword(moduleName: string, key: string): string | null;
    deletePassword(moduleName: string, key: string): void;
  };
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
    console.log(`[modules] SSE emit: ${event.type}`);
    sse?.emit(event);
  }

  const DAEMON_MAX_RETRIES = 5;
  const DAEMON_RETRY_BASE_MS = 2_000;

  async function startDaemon(name: string, retryCount = 0): Promise<void> {
    const manifest = manifests.get(name);
    if (!manifest?.daemon?.entry) return;
    if (!deps.dynamicToolRegistry) {
      console.warn(`[modules] Cannot start daemon for ${name}: no dynamic tool registry`);
      return;
    }

    const config = loadConfig();
    const moduleConfig = config.modules[name]?.config ?? {};
    const key = `${name}:daemon`;

    try {
      const entryPath = manifest.daemon.entry.startsWith('.') && deps.modulesBaseDir
        ? join(deps.modulesBaseDir, name, manifest.daemon.entry)
        : manifest.daemon.entry;
      const mod = await import(entryPath);

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
          if (dedup.isDuplicate(appEvent.content)) return;
          dedup.record(appEvent.content);
        }
        triageHandler?.(appEvent).catch((err: unknown) => {
          console.error(`[modules] triageHandler error for ${key}:`, (err as Error).message);
        });
      };

      const modulesDataDir = deps.modulesDataBaseDir
        || join(process.env.HOME || '', '.config', 'opentidy', 'modules');
      const ctx = createModuleContext(name, moduleConfig, emit, deps.dynamicToolRegistry, modulesDataDir, (event) => emitSSE(event));
      await mod.start(ctx);

      activeReceivers.set(key, {
        stop: async () => {
          await mod.stop();
          await ctx.runShutdownHandlers();
          ctx.unregisterAllTools();
        },
      });
      console.log(`[modules] Started daemon ${key}`);
    } catch (err) {
      console.error(`[modules] Failed to start daemon ${key}:`, (err as Error).message);

      if (retryCount < DAEMON_MAX_RETRIES) {
        const delay = DAEMON_RETRY_BASE_MS * Math.pow(2, retryCount);
        console.warn(`[modules] Retrying daemon ${key} in ${delay}ms (attempt ${retryCount + 1}/${DAEMON_MAX_RETRIES})`);
        setTimeout(() => startDaemon(name, retryCount + 1), delay);
      } else {
        console.error(`[modules] Daemon ${key} failed after ${DAEMON_MAX_RETRIES} attempts`);
        const cfg = loadConfig();
        if (cfg.modules[name]) {
          cfg.modules[name].health = 'error';
          cfg.modules[name].healthError = (err as Error).message;
          cfg.modules[name].healthCheckedAt = new Date().toISOString();
          saveConfig(cfg);
        }
        emitSSE({ type: 'module:error', data: { name, error: (err as Error).message }, timestamp: new Date().toISOString() });
      }
    }
  }

  async function restartDaemon(name: string): Promise<void> {
    const key = `${name}:daemon`;
    const existing = activeReceivers.get(key);
    if (existing) {
      await existing.stop();
      activeReceivers.delete(key);
    }
    await startDaemon(name);
  }

  async function startReceivers(name: string): Promise<void> {
    const manifest = manifests.get(name);
    if (manifest?.daemon?.entry) return; // daemon handles receiving
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
        // Resolve entry path relative to the module directory, not lifecycle.ts
        const entryPath = receiverDef.entry.startsWith('.') && deps.modulesBaseDir
          ? join(deps.modulesBaseDir, name, receiverDef.entry)
          : receiverDef.entry;
        const mod = await import(entryPath);
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
    await startDaemon(name);

    emitSSE({ type: 'module:enabled', data: { name }, timestamp: new Date().toISOString() });
  }

  async function disable(name: string, cleanData = false): Promise<void> {
    console.log(`[modules] Disabling module: ${name}`);

    await stopReceivers(name);

    // Clean module data directory (auth, SQLite, etc.) if requested
    if (cleanData) {
      const modulesDataDir = deps.modulesDataBaseDir
        || join(process.env.HOME || '', '.config', 'opentidy', 'modules');
      const dataDir = join(modulesDataDir, name);
      try {
        rmSync(dataDir, { recursive: true, force: true });
        console.log(`[modules] Cleaned data directory: ${dataDir}`);
      } catch {}
    }

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

    // Separate keychain fields from config fields
    const manifest = manifests.get(name);
    const keychainFields = new Set(
      (manifest?.setup?.configFields ?? [])
        .filter((f) => f.storage === 'keychain')
        .map((f) => f.key),
    );

    const configOnly: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(configValues)) {
      if (keychainFields.has(key)) {
        const strValue = String(value ?? '');
        if (strValue && deps.keychain) {
          deps.keychain.setPassword(name, key, strValue);
        } else if (!strValue && deps.keychain) {
          deps.keychain.deletePassword(name, key);
        }
      } else {
        configOnly[key] = value;
      }
    }

    const config = loadConfig();
    if (!config.modules[name]) {
      config.modules[name] = { enabled: false, source: 'curated' };
    }
    config.modules[name].config = {
      ...(config.modules[name].config ?? {}),
      ...configOnly,
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

  function registerCustomModule(name: string, manifest: ModuleManifest): void {
    console.log(`[modules] Registering custom module: ${name}`);

    const config = loadConfig();
    config.modules[name] = { enabled: false, source: 'custom' };
    saveConfig(config);

    manifests.set(name, manifest);

    emitSSE({ type: 'module:added', data: { name }, timestamp: new Date().toISOString() });
  }

  return { enable, disable, configure, startReceivers, startDaemon, restartDaemon, stopReceivers, stopAll, registerCustomModule };
}
