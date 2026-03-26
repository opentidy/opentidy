// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import ConfirmModal from '../../shared/ConfirmModal';

export default function DangerZonePanel() {
  const { t } = useTranslation();
  const { resetEverything } = useStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <div>
      <h2 className="text-lg font-bold text-text mb-1">{t('toolbox.dangerZone')}</h2>
      <p className="text-sm text-text-tertiary mb-6">{t('toolbox.dangerZoneDesc')}</p>

      <div className="bg-red/5 border border-red/10 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-red mb-1">{t('toolbox.resetTitle')}</h3>
        <p className="text-xs text-text-tertiary mb-4">{t('toolbox.resetDesc')}</p>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="rounded-lg bg-red px-3.5 py-1.5 text-xs font-medium text-white transition-colors"
        >
          {t('toolbox.resetButton')}
        </button>
      </div>

      <ConfirmModal
        open={showResetConfirm}
        title={t('toolbox.resetTitle')}
        description={t('toolbox.resetConfirm')}
        confirmLabel={t('toolbox.resetButton')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => {
          setShowResetConfirm(false);
          resetEverything();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
