// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';

export default function DangerZonePanel() {
  const { t } = useTranslation();
  const { resetEverything } = useStore();
  const [resetting, setResetting] = useState(false);

  return (
    <div>
      <h2 className="text-lg font-bold text-text mb-1">{t('toolbox.dangerZone')}</h2>
      <p className="text-sm text-text-tertiary mb-6">{t('toolbox.dangerZoneDesc')}</p>

      <div className="bg-red/5 border border-red/10 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-red mb-1">{t('toolbox.resetTitle')}</h3>
        <p className="text-xs text-text-tertiary mb-4">{t('toolbox.resetDesc')}</p>
        <button
          onClick={async () => {
            if (!confirm(t('toolbox.resetConfirm'))) return;
            setResetting(true);
            try { await resetEverything(); } finally { setResetting(false); }
          }}
          disabled={resetting}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            resetting
              ? 'bg-red/20 text-red cursor-wait'
              : 'bg-red text-white'
          }`}
        >
          {resetting ? t('toolbox.resetting') : t('toolbox.resetButton')}
        </button>
      </div>
    </div>
  );
}
