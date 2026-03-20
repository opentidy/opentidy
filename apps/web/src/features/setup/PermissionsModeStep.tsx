// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Preset = 'supervised' | 'autonomous' | 'fullauto';

interface PermissionsModeStepProps {
  onNext: () => void;
  onBack: () => void;
}

const PRESETS: { id: Preset; icon: string }[] = [
  { id: 'supervised', icon: '🔍' },
  { id: 'autonomous', icon: '⚡' },
  { id: 'fullauto', icon: '🤖' },
];

export function PermissionsModeStep({ onNext, onBack }: PermissionsModeStepProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Preset>('autonomous');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/permissions/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: selected }),
      });
    } catch {
      // Best-effort — advance anyway
    } finally {
      setSubmitting(false);
    }
    onNext();
  };

  return (
    <form
      className="mx-auto flex w-full max-w-lg flex-col gap-8"
      onSubmit={handleSubmit}
    >
      <div className="text-center">
        <h2 className="text-xl font-bold text-fg">{t('setup.permissionsMode')}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t('setup.permissionsModeDesc')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {PRESETS.map(({ id, icon }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`flex items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors ${
                isSelected
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-secondary hover:bg-card-hover'
              }`}
            >
              <span className="text-2xl leading-none mt-0.5">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">
                    {t(`setup.preset${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
                  </span>
                  {id === 'autonomous' && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      default
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {t(`setup.preset${id.charAt(0).toUpperCase()}${id.slice(1)}Desc`)}
                </p>
              </div>
              <div
                className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                  isSelected ? 'border-accent bg-accent' : 'border-border'
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-fg hover:bg-bg-secondary"
        >
          {t('setup.back')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {t('setup.continue')}
        </button>
      </div>
    </form>
  );
}
