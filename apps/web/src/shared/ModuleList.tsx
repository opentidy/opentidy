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
      } catch (err) { console.error('[modules] Failed to parse auth-required SSE event:', err); }
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
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setQrData(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>

            <div className="flex justify-center mb-6">
              <div className="relative">
                <QRCodeSVG value={qrData.qr} size={280} level="M" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white p-1 rounded-full">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.72.44 3.34 1.21 4.75L2 22l5.35-1.17C8.72 21.56 10.32 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="#25D366"/>
                      <path d="M17.5 14.38c-.31-.15-1.83-.9-2.11-1-.29-.11-.5-.15-.7.15-.21.31-.8 1-.98 1.21-.18.2-.36.23-.67.08-.31-.16-1.3-.48-2.49-1.53-.92-.82-1.54-1.83-1.72-2.14-.18-.31-.02-.48.13-.63.14-.14.31-.36.46-.54.15-.18.2-.31.31-.52.1-.2.05-.38-.03-.54-.08-.15-.7-1.69-.96-2.31-.25-.61-.51-.53-.7-.54h-.6c-.2 0-.54.08-.82.38-.28.31-1.08 1.05-1.08 2.57s1.1 2.98 1.26 3.19c.15.2 2.17 3.31 5.26 4.64.74.32 1.31.51 1.76.65.74.24 1.41.2 1.94.12.59-.09 1.83-.75 2.09-1.47.26-.72.26-1.34.18-1.47-.08-.13-.28-.21-.59-.36z" fill="white"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
              {t('modules.whatsappTitle', 'Se connecter à WhatsApp')}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              {t('modules.scanQr')}
            </p>

            <ol className="border border-gray-200 rounded-xl px-5 py-4 space-y-2.5 text-sm text-gray-700 list-decimal list-inside">
              <li>{t('modules.whatsappStep1', 'Ouvrez WhatsApp sur votre téléphone.')}</li>
              <li>{t('modules.whatsappStep2', 'Appuyez sur Paramètres (iPhone) ou Menu (Android).')}</li>
              <li>{t('modules.whatsappStep3', 'Appareils connectés → Connecter un appareil.')}</li>
              <li>{t('modules.whatsappStep4', 'Scannez ce QR code avec votre téléphone.')}</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
