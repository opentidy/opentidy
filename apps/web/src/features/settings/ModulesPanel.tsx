// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo } from '@opentidy/shared';
import ModuleCard from './ModuleCard';
import ModuleConfigDialog from './ModuleConfigDialog';

const BASE = '/api';

async function fetchModules(): Promise<ModuleInfo[]> {
  const res = await fetch(`${BASE}/modules`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.modules;
}

export default function ModulesPanel() {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);

  async function refetch() {
    try {
      setModules(await fetchModules());
    } catch (err) {
      console.error('[settings] failed to fetch modules:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    fetchModules()
      .then(setModules)
      .catch((err) => {
        console.error('[settings] failed to fetch modules:', err.message);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleEnable(name: string) {
    try {
      await fetch(`${BASE}/modules/${name}/enable`, { method: 'POST' });
      await refetch();
    } catch (err) {
      console.error('[settings] enable module failed:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  async function handleDisable(name: string) {
    try {
      await fetch(`${BASE}/modules/${name}/disable`, { method: 'POST' });
      await refetch();
    } catch (err) {
      console.error('[settings] disable module failed:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  async function handleConfigure(name: string) {
    setConfiguring(name);
  }

  async function handleSave(name: string, config: Record<string, unknown>) {
    await fetch(`${BASE}/modules/${name}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setConfiguring(null);
    await refetch();
  }

  async function handleRemove(name: string) {
    try {
      await fetch(`${BASE}/modules/${name}`, { method: 'DELETE' });
      await refetch();
    } catch (err) {
      console.error('[settings] remove module failed:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  const configuringModule = modules.find((m) => m.name === configuring);

  if (loading) {
    return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t('settings.modulesTitle')}</h2>
          <p className="text-xs text-text-tertiary">{t('settings.modulesDescription')}</p>
        </div>
        {/* Add module button — placeholder for AddModuleDialog (Task 11) */}
        <button
          type="button"
          disabled
          className="px-4 py-1.5 text-sm border border-accent/30 text-accent rounded-lg hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('settings.addModule')}
        </button>
      </div>

      {error && (
        <div className="text-red-500 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{error}</div>
      )}

      {modules.length === 0 ? (
        <div className="text-text-tertiary text-sm">{t('settings.noModules')}</div>
      ) : (
        <div className="space-y-3">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.name}
              module={mod}
              onEnable={handleEnable}
              onDisable={handleDisable}
              onConfigure={handleConfigure}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {configuringModule && (
        <ModuleConfigDialog
          module={configuringModule}
          open
          onClose={() => setConfiguring(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
