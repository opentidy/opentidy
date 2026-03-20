// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import { ModuleList } from '../../shared/ModuleList';

interface ModulesStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ModulesStep({ onNext, onBack }: ModulesStepProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div className="text-center">
        <h2 className="text-xl font-bold text-fg">{t('setup.modules')}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t('setup.modulesDesc')}</p>
      </div>

      <ModuleList autoEnableCore />

      <p className="text-xs text-fg-muted text-center">{t('setup.laterInSettings')}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-fg hover:bg-bg-secondary"
        >
          {t('setup.back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90"
        >
          {t('setup.continue')}
        </button>
      </div>
    </div>
  );
}
