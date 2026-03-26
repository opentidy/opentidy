// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo } from '@opentidy/shared';
import { QRCodeSVG } from 'qrcode.react';
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
  const [qrData, setQrData] = useState<{ name: string; qr: string } | null>(null);

  // Listen for daemon auth SSE events (QR code for WhatsApp etc.)
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('module:auth-required', (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data);
        setQrData({ name: event.data.name, qr: event.data.qr });
      } catch {}
    });
    es.addEventListener('module:auth-complete', () => {
      setQrData(null);
      refetch();
    });
    return () => es.close();
  }, []);

  async function refetch() {
    try {
      const mods = await fetchModules();
      setModules(mods);
    } catch (err) {
      console.error('[modules] failed to fetch:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    fetchModules()
      .then(async (mods) => {
        setModules(mods);
        // Auto-enable during setup wizard only: core modules (opentidy)
        const toEnable = autoEnableCore
          ? mods.filter((m) => !m.enabled && m.core)
          : [];
        for (const mod of toEnable) {
          await fetch(`/api/modules/${mod.name}/enable`, { method: 'POST' });
        }
        if (toEnable.length > 0) {
          const freshMods = await fetchModules();
          setModules(freshMods);
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
    await fetch(`/api/modules/${name}/disable?clean=true`, { method: 'POST' });
    refetch();
  }

  // Poll verify endpoint while terminal is open , auto-close on success
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
        } catch { /* ignore */ }
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
      } catch { /* ignore */ }
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

  return (
    <>
      {error && (
        <div className="text-red text-sm p-3 bg-red/10 rounded-lg mb-4">{error}</div>
      )}

      {modules.length === 0 ? (
        <div className="text-text-tertiary text-sm">{t('settings.noModules')}</div>
      ) : (
        <div className="space-y-5">
          {installed.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                {t('setup.installed')} ({installed.length})
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {installed.map((mod) => (
                  <ModuleCard
                    key={mod.name}
                    module={mod}
                    onEnable={handleEnable}
                    onDisable={handleDisable}
                    onInstall={handleInstall}
                  />
                ))}
              </div>
            </div>
          )}

          {available.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                {t('setup.available')} ({available.length})
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {available.map((mod) => (
                  <ModuleCard
                    key={mod.name}
                    module={mod}
                    onEnable={handleEnable}
                    onDisable={handleDisable}
                    onInstall={handleInstall}
                  />
                ))}
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

      {qrData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setQrData(null)}>
          <div className="bg-card rounded-2xl p-8 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-center mb-2">
              {modules.find(m => m.name === qrData.name)?.label ?? qrData.name}
            </h3>
            <p className="text-sm text-text-secondary text-center mb-6">
              {t('modules.scanQr')}
            </p>
            <div className="flex justify-center bg-white p-4 rounded-xl">
              <QRCodeSVG value={qrData.qr} size={256} />
            </div>
            <p className="text-xs text-text-tertiary text-center mt-4">
              {t('modules.qrHint')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
