// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ModuleInfo,
  PermissionConfig,
  PermissionLevel,
  PermissionPreset,
  ModulePermissionLevel,
  ToolDef,
} from '@opentidy/shared';

// Built-in capability keys — matches BUILTIN_CAPABILITY_PERMISSIONS in agent-config.ts
const BUILTIN_KEYS = ['readFiles', 'writeFiles', 'runCommands', 'webAccess', 'subAgents'] as const;

// Default level per preset for each capability
const BUILTIN_DEFAULTS: Record<PermissionPreset, Record<string, PermissionLevel>> = {
  supervised: { readFiles: 'allow', writeFiles: 'ask', runCommands: 'ask', webAccess: 'ask', subAgents: 'ask' },
  assisted:   { readFiles: 'allow', writeFiles: 'allow', runCommands: 'ask', webAccess: 'allow', subAgents: 'ask' },
  autonomous: { readFiles: 'allow', writeFiles: 'allow', runCommands: 'allow', webAccess: 'allow', subAgents: 'allow' },
};

const PRESETS: PermissionPreset[] = ['supervised', 'assisted', 'autonomous'];
const LEVELS: PermissionLevel[] = ['allow', 'ask', 'block'];

function levelColor(level: PermissionLevel) {
  if (level === 'allow') return { text: 'text-green', dot: 'bg-green', ring: 'border-green bg-green' };
  if (level === 'ask') return { text: 'text-yellow-400', dot: 'bg-yellow-400', ring: 'border-yellow-400 bg-yellow-400' };
  return { text: 'text-red', dot: 'bg-red', ring: 'border-red bg-red' };
}

async function fetchModules(): Promise<ModuleInfo[]> {
  const res = await fetch('/api/modules');
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.modules;
}

async function fetchPermissions(): Promise<PermissionConfig | null> {
  try {
    const res = await fetch('/api/permissions/config');
    if (!res.ok) return null;
    const data = await res.json();
    return data.permissions;
  } catch {
    return null;
  }
}

export default function PermissionsPanel() {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [permissions, setPermissions] = useState<PermissionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPreset, setSavingPreset] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchModules(), fetchPermissions()])
      .then(([mods, perms]) => { setModules(mods); setPermissions(perms); })
      .catch((err) => console.error('[permissions] fetch error:', err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handlePreset(preset: PermissionPreset) {
    setSavingPreset(true);
    try {
      const res = await fetch('/api/permissions/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      });
      if (res.ok) {
        const data = await res.json();
        // Reset builtin overrides when preset changes
        const updated = { ...data.permissions, builtins: undefined };
        await fetch('/api/permissions/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        setPermissions(updated);
      }
    } catch { /* ignore */ } finally {
      setSavingPreset(false);
    }
  }

  async function handleBuiltinChange(key: string, level: PermissionLevel) {
    if (!permissions) return;
    setSavingPreset(true);

    const preset = permissions.preset ?? 'supervised';
    const defaultLevel = BUILTIN_DEFAULTS[preset][key];
    const builtins = permissions.builtins ?? {};

    // If matches preset default, remove override; otherwise set it
    const currentOverrides = level === defaultLevel
      ? Object.fromEntries(Object.entries(builtins).filter(([k]) => k !== key))
      : { ...builtins, [key]: level };

    const updated: PermissionConfig = {
      ...permissions,
      builtins: Object.keys(currentOverrides).length > 0 ? currentOverrides : undefined,
    };
    try {
      const res = await fetch('/api/permissions/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) setPermissions(updated);
    } catch { /* ignore */ } finally {
      setSavingPreset(false);
    }
  }

  function normalizeLevel(value: PermissionLevel | ModulePermissionLevel | undefined): ModulePermissionLevel | undefined {
    if (!permissions) return undefined;
    if (!value) {
      const d = permissions.defaultLevel ?? 'ask';
      return { safe: d, critical: d };
    }
    if (typeof value === 'string') return { safe: value, critical: value };
    if ('read' in value && !('safe' in value)) {
      return { safe: (value as any).read, critical: (value as any).write, overrides: (value as any).overrides };
    }
    return value;
  }

  function findToolGroup(moduleName: string, toolName: string): 'safe' | 'critical' {
    const mod = modules.find(m => m.name === moduleName);
    const tp = mod?.toolPermissions;
    if (tp?.safe?.some((d: any) => (typeof d === 'string' ? d : d.tool) === toolName)) return 'safe';
    return 'critical';
  }

  async function handlePermissionChange(moduleName: string, key: 'safe' | 'critical' | string, level: PermissionLevel) {
    if (!permissions) return;
    setSavingModule(moduleName);
    const current = normalizeLevel(permissions.modules[moduleName])!;

    let newValue: ModulePermissionLevel;
    if (key === 'safe' || key === 'critical') {
      newValue = { ...current, [key]: level };
    } else {
      const group = findToolGroup(moduleName, key);
      const groupLevel = current[group];
      const existingOverrides = current.overrides ?? {};
      const overrides = level === groupLevel
        ? Object.fromEntries(Object.entries(existingOverrides).filter(([k]) => k !== key))
        : { ...existingOverrides, [key]: level };
      newValue = { ...current, overrides: Object.keys(overrides).length > 0 ? overrides : undefined };
    }

    const updated: PermissionConfig = {
      ...permissions,
      modules: { ...permissions.modules, [moduleName]: newValue },
    };
    try {
      const res = await fetch('/api/permissions/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) setPermissions(updated);
    } catch { /* ignore */ } finally {
      setSavingModule(null);
    }
  }

  if (loading) {
    return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;
  }

  const preset = permissions?.preset ?? 'supervised';
  const builtinDefaults = BUILTIN_DEFAULTS[preset];
  const enabledModulesWithTools = modules.filter(m => {
    if (!m.enabled) return false;
    const tp = m.toolPermissions;
    return (tp?.safe?.length ?? 0) > 0 || (tp?.critical?.length ?? 0) > 0;
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t('permissions.title')}</h2>
        <p className="text-xs text-text-tertiary">{t('permissions.description')}</p>
      </div>

      {/* Preset selector */}
      <div className="mb-6">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          {t('permissions.presetLabel')}
        </h3>
        <div className="flex gap-2">
          {PRESETS.map((id) => {
            const isSelected = preset === id;
            const presetKey = id.charAt(0).toUpperCase() + id.slice(1);
            return (
              <button
                key={id}
                type="button"
                disabled={savingPreset}
                onClick={() => handlePreset(id)}
                className={`flex flex-1 flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent/[.08] text-text'
                    : 'border-border bg-surface hover:bg-card text-text-secondary'
                } disabled:opacity-40`}
              >
                <span className="text-xs font-semibold">{t(`setup.preset${presetKey}`)}</span>
                <span className="text-[12px] leading-tight text-text-tertiary line-clamp-2">
                  {t(`setup.preset${presetKey}Desc`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Built-in permissions */}
      <div className="mb-6">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
          {t('permissions.builtinLabel')}
        </h3>
        <div className="rounded-lg border border-border overflow-hidden text-[13px]">
          <div className="grid grid-cols-[1fr_52px_52px_52px] border-b border-border bg-surface/30">
            <span className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary">{t('settings.permTool')}</span>
            {LEVELS.map(l => (
              <span key={l} className={`text-center py-1.5 text-[11px] font-semibold ${levelColor(l).text}`}>
                {t(`settings.levelDesc.${l}`)}
              </span>
            ))}
          </div>
          {BUILTIN_KEYS.map((key, i) => {
            const current = permissions?.builtins?.[key] ?? builtinDefaults[key];
            const overridden = permissions?.builtins?.[key] != null;
            return (
              <div
                key={key}
                className={`grid grid-cols-[1fr_52px_52px_52px] ${
                  i < BUILTIN_KEYS.length - 1 ? 'border-b border-border/30' : ''
                } ${overridden ? 'bg-yellow-400/[0.03]' : ''}`}
              >
                <span className={`px-3 py-1.5 ${overridden ? 'text-text font-medium' : 'text-text-secondary'}`}>
                  {t(`permissions.${key}`)}
                </span>
                {LEVELS.map(l => (
                  <button
                    key={l}
                    type="button"
                    disabled={savingPreset}
                    onClick={() => handleBuiltinChange(key, l)}
                    className="flex items-center justify-center py-2 px-2 hover:bg-white/[0.04] disabled:opacity-40 cursor-pointer"
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      current === l
                        ? `${levelColor(l).ring} shadow-[inset_0_0_0_2px_var(--color-card)]`
                        : 'border-border'
                    }`} />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Module permissions */}
      {enabledModulesWithTools.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            {t('permissions.moduleLabel')}
          </h3>
          <div className="space-y-3">
            {enabledModulesWithTools.map((mod) => {
              const tp = mod.toolPermissions;
              const safeDefs: ToolDef[] = (tp?.safe ?? []) as ToolDef[];
              const criticalDefs: ToolDef[] = (tp?.critical ?? []) as ToolDef[];
              const allDefs = [...safeDefs, ...criticalDefs];
              const levels = normalizeLevel(permissions?.modules[mod.name]);

              function getToolLevel(def: ToolDef): PermissionLevel {
                if (levels?.overrides?.[def.tool]) return levels.overrides[def.tool];
                const isSafe = safeDefs.some(d => d.tool === def.tool);
                return isSafe ? (levels?.safe ?? 'allow') : (levels?.critical ?? 'ask');
              }

              return (
                <div key={mod.name} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface/50 border-b border-border flex items-center gap-2">
                    <span className="font-semibold text-[13px]">{mod.label}</span>
                    {tp?.scope && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-card text-text-tertiary">
                        {t(`settings.scope.${tp.scope}`)}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px]">
                    <div className="grid grid-cols-[1fr_52px_52px_52px] border-b border-border bg-surface/30">
                      <span className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary">{t('settings.permTool')}</span>
                      {LEVELS.map(l => (
                        <span key={l} className={`text-center py-1.5 text-[11px] font-semibold ${levelColor(l).text}`}>
                          {t(`settings.levelDesc.${l}`)}
                        </span>
                      ))}
                    </div>
                    {allDefs.map((def, i) => {
                      const current = getToolLevel(def);
                      const overridden = levels?.overrides?.[def.tool] != null;
                      return (
                        <div
                          key={def.tool}
                          className={`grid grid-cols-[1fr_52px_52px_52px] ${
                            i < allDefs.length - 1 ? 'border-b border-border/30' : ''
                          } ${overridden ? 'bg-yellow-400/[0.03]' : ''}`}
                        >
                          <span className={`px-3 py-1.5 ${overridden ? 'text-text font-medium' : 'text-text-secondary'}`}>
                            {def.label}
                          </span>
                          {LEVELS.map(l => (
                            <button
                              key={l}
                              type="button"
                              disabled={savingModule === mod.name}
                              onClick={() => handlePermissionChange(mod.name, def.tool, l)}
                              className="flex items-center justify-center py-2 px-2 hover:bg-white/[0.04] disabled:opacity-40 cursor-pointer"
                            >
                              <span className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                current === l
                                  ? `${levelColor(l).ring} shadow-[inset_0_0_0_2px_var(--color-card)]`
                                  : 'border-border'
                              }`} />
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {enabledModulesWithTools.length === 0 && (
        <p className="text-text-tertiary text-sm">{t('permissions.noModuleTools')}</p>
      )}
    </div>
  );
}
