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
    <form
      className="mx-auto flex w-full max-w-lg flex-col gap-8"
      onSubmit={(e) => { e.preventDefault(); onNext(); }}
    >
      <div className="text-center">
        <h2 className="text-xl font-bold text-text">{t('setup.modules')}</h2>
        <p className="mt-1 text-text-secondary text-sm">{t('setup.modulesDesc')}</p>
      </div>

      <ModuleList autoEnableCore />

      <p className="text-xs text-text-secondary text-center">{t('setup.laterInSettings')}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-text hover:bg-card"
        >
          {t('setup.back')}
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90"
        >
          {t('setup.continue')}
        </button>
      </div>
    </form>
  );
}
