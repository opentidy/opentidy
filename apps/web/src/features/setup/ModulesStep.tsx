// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleInfo } from '@opentidy/shared';
import ModuleCard from '../settings/ModuleCard';
import ModuleConfigDialog from '../settings/ModuleConfigDialog';

interface ModulesStepProps {
  onNext: () => void;
  onBack: () => void;
}

async function fetchModules(): Promise<ModuleInfo[]> {
  const res = await fetch('/api/modules');
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.modules;
}

export function ModulesStep({ onNext, onBack }: ModulesStepProps) {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);

  async function refetch() {
    try {
      setModules(await fetchModules());
    } catch (err) {
      console.error('[setup/modules] failed to fetch modules:', (err as Error).message);
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    fetchModules()
      .then(setModules)
      .catch((err) => {
        console.error('[setup/modules] failed to fetch modules:', err.message);
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

  async function handleSave(name: string, config: Record<string, unknown>) {
    await fetch(`/api/modules/${name}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setConfiguring(null);
    refetch();
  }

  const configuringModule = modules.find((m) => m.name === configuring);

  return (
    <div className="w-full max-w-lg">
      <h2 className="text-2xl font-semibold mb-1">{t('setup.modules')}</h2>
      <p className="text-text-secondary mb-6">{t('setup.modulesDesc')}</p>

      {error && (
        <div className="text-red-500 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>
      ) : modules.length === 0 ? (
        <div className="text-text-tertiary text-sm">{t('settings.noModules')}</div>
      ) : (
        <div className="space-y-3 mb-6">
          {modules.map((mod) => (
            <ModuleCard
              key={mod.name}
              module={mod}
              onEnable={handleEnable}
              onDisable={handleDisable}
              onConfigure={setConfiguring}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-text-tertiary mb-6">{t('setup.laterInSettings')}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-border text-text-secondary hover:bg-card-hover transition-colors"
        >
          {t('setup.back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
        >
          {t('setup.continue')}
        </button>
      </div>

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
