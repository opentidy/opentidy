// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import { useStore } from './store';

export default function ErrorBanner() {
  const { t } = useTranslation();
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);

  if (!error) return null;

  return (
    <div className="bg-red-900/80 text-red-100 px-4 py-2 text-sm flex items-center justify-between gap-4">
      <span>{t('errorBanner.error', { message: error })}</span>
      <button onClick={clearError} className="text-red-300 hover:text-white shrink-0">
        {t('errorBanner.close')}
      </button>
    </div>
  );
}