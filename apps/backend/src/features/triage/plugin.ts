// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export interface ReceiverPluginMessage {
  from: string;
  body: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface ReceiverPlugin {
  /** Unique name for this receiver (e.g., 'gmail-webhook', 'imessage') */
  name: string;
  /** Event source type used in triage (e.g., 'email', 'sms') */
  source: string;
  /** One-time initialization (connect, auth, etc.) */
  init: () => Promise<void> | void;
  /** Start receiving — call onMessage for each new message */
  start: (onMessage: (msg: ReceiverPluginMessage) => void) => Promise<void> | void;
  /** Stop receiving — cleanup resources */
  stop: () => Promise<void> | void;
}

export interface ReceiverConfig {
  type: string;       // built-in name or npm package name
  enabled: boolean;
  options?: Record<string, unknown>;
}

// Built-in receiver factories — keyed by type name
const builtinFactories: Record<string, (options?: Record<string, unknown>) => ReceiverPlugin> = {};

export function registerBuiltinReceiver(
  type: string,
  factory: (options?: Record<string, unknown>) => ReceiverPlugin,
): void {
  builtinFactories[type] = factory;
}

export async function loadReceiverPlugins(
  config: { receivers: ReceiverConfig[] },
): Promise<ReceiverPlugin[]> {
  const plugins: ReceiverPlugin[] = [];

  for (const receiver of config.receivers) {
    if (!receiver.enabled) continue;

    // Try built-in first
    const factory = builtinFactories[receiver.type];
    if (factory) {
      plugins.push(factory(receiver.options));
      continue;
    }

    // Lazy-load macOS-only receivers on demand (no race condition)
    if (process.platform === 'darwin') {
      if (receiver.type === 'imessage') {
        const mod = await import('./sms-reader.js');
        const plugin = mod.createSmsReceiverPlugin(receiver.options);
        plugins.push(plugin);
        continue;
      }
    }

    // Try loading as npm package (e.g., '@opentidy/receivers-macos')
    try {
      const mod = await import(receiver.type);
      if (typeof mod.createReceiver === 'function') {
        plugins.push(mod.createReceiver(receiver.options));
      } else {
        console.warn(`[receiver] Plugin ${receiver.type} has no createReceiver export`);
      }
    } catch (err) {
      console.error(`[receiver] Failed to load plugin ${receiver.type}:`, (err as Error).message);
    }
  }

  return plugins;
}