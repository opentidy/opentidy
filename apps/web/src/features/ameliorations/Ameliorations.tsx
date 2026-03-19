// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import AmeliorationCard from './AmeliorationCard';
import type { AmeliorationStatus, AmeliorationCategory } from '@opentidy/shared';

type Filter = 'open' | 'resolved' | 'ignored';

export default function Ameliorations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ameliorations, fetchAmeliorations, resolveAmelioration, ignoreAmelioration } = useStore();
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(ameliorations.length === 0);

  useEffect(() => { fetchAmeliorations().finally(() => setLoading(false)); }, [fetchAmeliorations]);

  const filterLabels: Record<Filter, string> = {
    open: t('ameliorations.open'),
    resolved: t('ameliorations.resolved'),
    ignored: t('ameliorations.ignored'),
  };

  const categoryLabels: Record<AmeliorationCategory, string> = {
    capability: t('ameliorations.category.capability'),
    access: t('ameliorations.category.access'),
    config: t('ameliorations.category.config'),
    process: t('ameliorations.category.process'),
    data: t('ameliorations.category.data'),
  };

  const statusForFilter: Record<Filter, AmeliorationStatus> = {
    open: 'open',
    resolved: 'resolved',
    ignored: 'ignored',
  };

  const filtered = ameliorations.filter((a) => {
    const status = a.status ?? (a.resolved ? 'resolved' : 'open');
    return status === statusForFilter[filter];
  });

  const openCount = ameliorations.filter((a) => (a.status ?? (a.resolved ? 'resolved' : 'open')) === 'open').length;

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text">{t('ameliorations.title')}</h1>
          <span className="text-xs px-2 py-0.5 rounded-md bg-text-tertiary/20 text-text-tertiary font-medium">
            {loading ? '...' : t('ameliorations.openCount', { count: openCount })}
          </span>
        </div>
        <div className="flex gap-2">
          {(['open', 'resolved', 'ignored'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filter === f
                  ? 'bg-text/10 border-text/20 text-text'
                  : 'border-border text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((amelioration) => (
          <AmeliorationCard
            key={amelioration.id}
            amelioration={amelioration}
            categoryLabels={categoryLabels}
            onResolve={() => resolveAmelioration(amelioration.id)}
            onIgnore={() => ignoreAmelioration(amelioration.id)}
            onNavigate={(dossierId) => navigate(`/dossier/${dossierId}`)}
          />
        ))}
        {loading && filtered.length === 0 && (
          <p className="text-text-tertiary text-sm py-8 text-center animate-pulse">
            {t('common.loading')}
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-text-tertiary text-sm py-8 text-center">
            {t('ameliorations.noAnalyses', { filter: filterLabels[filter].toLowerCase() })}
          </p>
        )}
      </div>
    </div>
  );
}
