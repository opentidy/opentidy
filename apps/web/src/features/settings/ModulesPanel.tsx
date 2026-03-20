// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModuleList } from '../../shared/ModuleList';
import AddModuleDialog from './AddModuleDialog';

export default function ModulesPanel() {
  const { t } = useTranslation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t('settings.modulesTitle')}</h2>
          <p className="text-xs text-text-tertiary">{t('settings.modulesDescription')}</p>
        </div>
        <button
          type="button"
          onClick={() => setAddDialogOpen(true)}
          className="px-4 py-1.5 text-sm border border-accent/30 text-accent rounded-lg hover:bg-accent/10 transition-colors"
        >
          {t('settings.addModule')}
        </button>
      </div>

      <ModuleList />

      <AddModuleDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={() => window.location.reload()}
      />
    </div>
  );
}
