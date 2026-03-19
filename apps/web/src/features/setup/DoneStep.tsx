// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export function DoneStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleNavigate = async (path: string) => {
    try {
      await fetch('/api/setup/complete', { method: 'POST' });
    } catch {
      // Best-effort — navigate anyway
    }
    navigate(path);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8 text-center">
      {/* Checkmark */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-green-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      <div>
        <h2 className="text-xl font-bold text-fg">{t('setup.done')}</h2>
        <p className="mt-2 text-fg-muted">{t('setup.doneDesc')}</p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => handleNavigate('/nouveau')}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
        >
          {t('setup.createTask')}
        </button>
        <button
          type="button"
          onClick={() => handleNavigate('/toolbox')}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 font-medium text-fg transition-colors hover:bg-bg-secondary"
        >
          {t('setup.configureServices')}
        </button>
      </div>
    </div>
  );
}
