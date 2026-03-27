// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Suggestion } from '@opentidy/shared';
import { useStore } from './store';
import { urgencyColors } from './utils/status-colors';

const sourceIcons: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  checkup: 'Checkup',
  app: 'App',
};

export default function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { t } = useTranslation();
  const { approveSuggestion, ignoreSuggestion } = useStore();
  const colors = urgencyColors[suggestion.urgency] ?? urgencyColors.normal;
  const [expanded, setExpanded] = useState(false);
  const sourceLabel = sourceIcons[suggestion.source] ?? suggestion.source;

  return (
    <div className={`bg-card rounded-xl p-4 border-l-4 ${colors.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-[7px] h-[7px] rounded-full ${colors.dot} shrink-0`} />
            <span className="font-semibold text-text">{suggestion.title}</span>
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors.badgeBg} ${colors.badge} capitalize`}>
              {suggestion.urgency}
            </span>
          </div>
          {/* Source + date */}
          <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
            {sourceLabel && <span className="text-[11px] px-1.5 py-0.5 rounded bg-card-hover text-text-secondary">{sourceLabel}</span>}
            {suggestion.date && <span>{suggestion.date}</span>}
          </div>
        </div>
      </div>

      {/* Why */}
      {suggestion.why && (
        <p className="text-sm text-text-secondary mt-3">{suggestion.why}</p>
      )}

      {/* Context (collapsible) */}
      {suggestion.context && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            {t('suggestion.viewOriginal')}
          </button>
          {expanded && (
            <pre className="mt-2 p-3 bg-[#161618] rounded-lg text-xs text-text-secondary whitespace-pre-wrap font-mono border border-border-subtle">
              {suggestion.context}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => approveSuggestion(suggestion.slug)}
          className="flex-1 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          {t('suggestion.createTask')}
        </button>
        <button
          onClick={() => ignoreSuggestion(suggestion.slug)}
          className="flex-1 py-2 text-sm rounded-lg border border-border text-text-secondary hover:bg-card-hover transition-colors"
        >
          {t('suggestion.ignore')}
        </button>
      </div>
    </div>
  );
}