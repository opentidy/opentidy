// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function SecurityPanel() {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    // Token is stored in config, not exposed via API. This is a placeholder
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a]">{t('settings.security')}</h2>
        <p className="text-xs text-text-tertiary">{t('settings.securityDescription')}</p>
      </div>

      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{t('settings.bearerToken')}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">{t('settings.bearerTokenNote')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="bg-card-hover rounded-lg px-3 py-1.5 text-xs text-text-secondary"
            >
              {revealed ? t('settings.hideToken') : t('settings.tokenHidden')}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="bg-card-hover rounded-lg px-3 py-1.5 text-xs text-text-secondary"
            >
              {copied ? t('settings.copied') : t('settings.copyToken')}
            </button>
          </div>
        </div>

        {revealed && (
          <div className="mt-3 p-3 bg-card rounded-lg text-xs font-mono text-text-secondary break-all">
            {t('settings.tokenStoredInConfig')}
          </div>
        )}
      </div>
    </div>
  );
}
