// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionLevel, PermissionPreset } from '@opentidy/shared';

interface ModulePermission {
  name: string;
  label: string;
  icon?: string;
  scope: string;
  criticalCount: number;
  level: PermissionLevel;
}

interface PermissionsConfig {
  preset: PermissionPreset;
  defaultLevel: PermissionLevel;
  modules: ModulePermission[];
}

type Preset = PermissionPreset;

const PRESETS: { id: Preset; icon: string }[] = [
  { id: 'supervised', icon: '🔍' },
  { id: 'autonomous', icon: '⚡' },
  { id: 'full-auto', icon: '🤖' },
];

const LEVELS: PermissionLevel[] = ['allow', 'confirm', 'ask'];

export default function PermissionsPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<PermissionsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPreset, setSavingPreset] = useState(false);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/permissions/config')
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePreset = async (preset: Preset) => {
    setSavingPreset(true);
    try {
      const res = await fetch('/api/permissions/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
      }
    } catch {
      // ignore
    } finally {
      setSavingPreset(false);
    }
  };

  const handleModuleLevel = async (moduleName: string, level: PermissionLevel) => {
    if (!config) return;
    setSavingModule(moduleName);
    try {
      const res = await fetch('/api/permissions/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleName, level }),
      });
      if (res.ok) {
        setConfig((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            modules: prev.modules.map((m) =>
              m.name === moduleName ? { ...m, level } : m
            ),
          };
        });
      }
    } catch {
      // ignore
    } finally {
      setSavingModule(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t('settings.permissionsTitle')}</h2>
        <p className="text-xs text-text-tertiary">{t('settings.permissionsDesc')}</p>
      </div>

      {/* Preset buttons */}
      <div className="mb-6 flex gap-3">
        {PRESETS.map(({ id, icon }) => {
          const isSelected = config?.preset === id;
          return (
            <button
              key={id}
              type="button"
              disabled={savingPreset}
              onClick={() => handlePreset(id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-3 py-3 transition-colors ${
                isSelected
                  ? 'border-accent bg-accent/10 text-fg'
                  : 'border-border bg-bg hover:bg-card-hover text-text-secondary'
              } disabled:opacity-40`}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-xs font-medium">
                {t(`setup.preset${id === 'full-auto' ? 'Fullauto' : id.charAt(0).toUpperCase() + id.slice(1)}`)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Per-module grid */}
      {loading ? (
        <div className="py-8 text-center text-sm text-text-tertiary">{t('common.loading')}</div>
      ) : !config || config.modules.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-tertiary">{t('settings.noModules')}</div>
      ) : (
        <div className="space-y-2">
          {config.modules.map((mod) => (
            <div
              key={mod.name}
              className="flex items-center gap-3 rounded-lg border border-border bg-bg px-4 py-3"
            >
              {/* Icon + label */}
              <span className="text-lg w-6 text-center shrink-0">{mod.icon ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-fg">{mod.label}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-tertiary">
                    {t(`scope.${mod.scope}`)}
                  </span>
                  {mod.criticalCount > 0 && (
                    <span className="text-xs text-text-tertiary">
                      · {mod.criticalCount} {t('settings.criticalTools')}
                    </span>
                  )}
                </div>
              </div>

              {/* Level buttons */}
              <div className="flex gap-1 shrink-0">
                {LEVELS.map((level) => {
                  const isActive = mod.level === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={savingModule === mod.name}
                      onClick={() => handleModuleLevel(mod.name, level)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-accent text-white'
                          : 'border border-border text-text-secondary hover:bg-card-hover'
                      } disabled:opacity-40`}
                    >
                      {t(`settings.level.${level}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
