// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import SuggestionCard from '../../shared/SuggestionCard';

export default function Suggestions() {
  const { t } = useTranslation();
  const { suggestions, fetchSuggestions } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuggestions().finally(() => setLoading(false));
  }, [fetchSuggestions]);

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-xl font-bold text-text">{t('suggestions.title')}</h1>
        {suggestions.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
            {t('home.new', { count: suggestions.length })}
          </span>
        )}
      </div>

      {loading && (
        <p className="text-text-tertiary text-sm py-20 text-center animate-pulse">{t('common.loading')}</p>
      )}

      {!loading && suggestions.length === 0 && (
        <p className="text-text-tertiary text-sm py-20 text-center">{t('onboarding.emptySuggestions')}</p>
      )}

      {!loading && suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((s) => <SuggestionCard key={s.slug} suggestion={s} />)}
        </div>
      )}
    </div>
  );
}
