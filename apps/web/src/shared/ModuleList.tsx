// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo } from '@opentidy/shared';
import ModuleCard from '../features/settings/ModuleCard';
import ModuleConfigDialog from '../features/settings/ModuleConfigDialog';
import { TerminalDrawer } from './TerminalDrawer';

async function fetchModules(): Promise<ModuleInfo[]> {
  const res = await fetch('/api/modules');
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.modules;
}

interface ModuleListProps {
  /** Auto-enable core modules on mount (setup wizard only) */
  autoEnableCore?: boolean;
}

export function ModuleList({ autoEnableCore }: ModuleListProps) {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [terminalModule, setTerminalModule] = useState<ModuleInfo | null>(null);
  const [configuringModule, setConfiguringModule] = useState<ModuleInfo | null>(null);

  async function refetch() {
    try {
      setModules(await fetchModules());
    } catch (err) {
      console.error('[modules] failed to fetch:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    fetchModules()
      .then(async (mods) => {
        setModules(mods);
        if (autoEnableCore) {
          const coreToEnable = mods.filter((m) => m.core && !m.enabled);
          for (const mod of coreToEnable) {
            await fetch(`/api/modules/${mod.name}/enable`, { method: 'POST' });
          }
          if (coreToEnable.length > 0) {
            setModules(await fetchModules());
          }
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
    return <div className="text-fg-muted text-sm animate-pulse">{t('common.loading')}</div>;
  }

  return (
    <>
      {error && (
        <div className="text-red-500 text-sm p-3 bg-red-500/10 rounded-lg mb-4">{error}</div>
      )}

      {modules.length === 0 ? (
        <div className="text-fg-muted text-sm">{t('settings.noModules')}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.name}
              module={mod}
              mode="setup"
              onEnable={handleEnable}
              onDisable={handleDisable}
              onConfigure={(name) => {
                const m = modules.find((x) => x.name === name);
                if (m) setConfiguringModule(m);
              }}
              onInstall={handleInstall}
            />
          ))}
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
