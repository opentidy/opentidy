// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo, PermissionConfig, PermissionLevel, PermissionPreset } from '@opentidy/shared';
import ModuleCard from '../features/settings/ModuleCard';
import ModuleConfigDialog from '../features/settings/ModuleConfigDialog';
import { TerminalDrawer } from './TerminalDrawer';

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

const PRESETS: { id: PermissionPreset; icon: string }[] = [
  { id: 'supervised', icon: '🔍' },
  { id: 'autonomous', icon: '⚡' },
  { id: 'full-auto', icon: '🤖' },
];

interface ModuleListProps {
  /** Auto-enable core modules on mount (setup wizard only) */
  autoEnableCore?: boolean;
}

export function ModuleList({ autoEnableCore }: ModuleListProps) {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionConfig | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const [terminalModule, setTerminalModule] = useState<ModuleInfo | null>(null);
  const [configuringModule, setConfiguringModule] = useState<ModuleInfo | null>(null);

  async function refetch() {
    try {
      const [mods, perms] = await Promise.all([fetchModules(), fetchPermissions()]);
      setModules(mods);
      setPermissions(perms);
    } catch (err) {
      console.error('[modules] failed to fetch:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    Promise.all([fetchModules(), fetchPermissions()])
      .then(async ([mods, perms]) => {
        setModules(mods);
        setPermissions(perms);
        // Auto-enable core modules + modules whose deps are already on disk
        const toEnable = mods.filter((m) =>
          !m.enabled && ((autoEnableCore && m.core) || m.ready === true)
        );
        for (const mod of toEnable) {
          await fetch(`/api/modules/${mod.name}/enable`, { method: 'POST' });
        }
        if (toEnable.length > 0) {
          const [freshMods, freshPerms] = await Promise.all([fetchModules(), fetchPermissions()]);
          setModules(freshMods);
          setPermissions(freshPerms);
        }
      })
      .catch((err) => {
        console.error('[modules] failed to fetch:', err.message);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleEnable(name: string) {
    await fetch(`/api/modules/${name}/enable`, { method: 'POST' });
    refetch();
  }

  async function handleDisable(name: string) {
    await fetch(`/api/modules/${name}/disable`, { method: 'POST' });
    refetch();
  }

  // Preset handler
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
        setPermissions(data.permissions);
      }
    } catch {
      // ignore
    } finally {
      setSavingPreset(false);
    }
  }

  // Per-module permission level handler
  async function handlePermissionChange(moduleName: string, level: PermissionLevel) {
    if (!permissions) return;
    setSavingModule(moduleName);
    const updated: PermissionConfig = {
      ...permissions,
      modules: { ...permissions.modules, [moduleName]: level },
    };
    try {
      const res = await fetch('/api/permissions/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setPermissions(updated);
      }
    } catch {
      // ignore
    } finally {
      setSavingModule(null);
    }
  }

  function getModuleLevel(moduleName: string): PermissionLevel | undefined {
    if (!permissions) return undefined;
    return permissions.modules[moduleName] ?? permissions.defaultLevel ?? 'confirm';
  }

  // Poll verify endpoint while terminal is open — auto-close on success
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!terminalModule) {
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
        verifyIntervalRef.current = null;
      }
      return;
    }

    const startPolling = () => {
      verifyIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/modules/${terminalModule.name}/verify`, { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            if (data.ready) {
              await handleEnable(terminalModule.name);
              setTerminalModule(null);
            }
          }
        } catch {
          // ignore
        }
      }, 1000);
    };

    const delay = setTimeout(startPolling, 2000);
    return () => {
      clearTimeout(delay);
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
        verifyIntervalRef.current = null;
      }
    };
  }, [terminalModule?.name]);

  function handleInstall(name: string) {
    const mod = modules.find((m) => m.name === name);
    if (!mod) return;

    if (mod.setup?.needsAuth) {
      setTerminalModule(mod);
    } else if ((mod.setup?.configFields?.length ?? 0) > 0) {
      setConfiguringModule(mod);
    } else {
      handleEnable(name);
    }
  }

  async function handleTerminalClose() {
    if (terminalModule) {
      try {
        const res = await fetch(`/api/modules/${terminalModule.name}/verify`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.ready) {
            await handleEnable(terminalModule.name);
          }
        }
      } catch {
        // ignore
      }
    }
    setTerminalModule(null);
    refetch();
  }

  async function handleConfigSave(name: string, config: Record<string, unknown>) {
    await fetch(`/api/modules/${name}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    await handleEnable(name);
    setConfiguringModule(null);
  }

  if (loading) {
    return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;
  }

  const installed = modules.filter((m) => m.enabled);
  const available = modules.filter((m) => !m.enabled);

  function renderCard(mod: ModuleInfo) {
    return (
      <ModuleCard
        key={mod.name}
        module={mod}
        onEnable={handleEnable}
        onDisable={handleDisable}
        onConfigure={(name) => {
          const m = modules.find((x) => x.name === name);
          if (m) setConfiguringModule(m);
        }}
        onInstall={handleInstall}
        permissionLevel={mod.enabled ? getModuleLevel(mod.name) : undefined}
        onPermissionChange={handlePermissionChange}
        savingPermission={savingModule === mod.name}
      />
    );
  }

  return (
    <>
      {error && (
        <div className="text-red text-sm p-3 bg-red/10 rounded-lg mb-4">{error}</div>
      )}

      {/* Preset buttons with descriptions */}
      {permissions && (
        <div className="mb-5 flex gap-2">
          {PRESETS.map(({ id, icon }) => {
            const isSelected = permissions.preset === id;
            const presetKey = id === 'full-auto' ? 'Fullauto' : id.charAt(0).toUpperCase() + id.slice(1);
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
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <span className="text-xs font-semibold">
                    {t(`setup.preset${presetKey}`)}
                  </span>
                </div>
                <span className="text-[10px] leading-tight text-text-tertiary line-clamp-2">
                  {t(`setup.preset${presetKey}Desc`)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {modules.length === 0 ? (
        <div className="text-text-tertiary text-sm">{t('settings.noModules')}</div>
      ) : (
        <div className="space-y-5">
          {/* Installed modules */}
          {installed.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                {t('setup.installed')} ({installed.length})
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {installed.map(renderCard)}
              </div>
            </div>
          )}

          {/* Available modules */}
          {available.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                {t('setup.available')} ({available.length})
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {available.map(renderCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {terminalModule?.setup?.authCommand && (
        <TerminalDrawer
          open
          title={terminalModule.label}
          moduleName={terminalModule.name}
          onClose={handleTerminalClose}
        />
      )}

      {configuringModule && (
        <ModuleConfigDialog
          module={configuringModule}
          open
          onClose={() => setConfiguringModule(null)}
          onSave={handleConfigSave}
        />
      )}
    </>
  );
}
