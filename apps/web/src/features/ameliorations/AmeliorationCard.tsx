// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import type { Amelioration, AmeliorationCategory } from '@opentidy/shared';

export const categoryColors: Record<AmeliorationCategory, string> = {
  capability: 'bg-accent/10 text-accent',
  access: 'bg-orange/10 text-orange',
  config: 'bg-purple/10 text-purple',
  process: 'bg-green/10 text-green',
  data: 'bg-[#64d2ff]/10 text-[#64d2ff]',
};

interface AmeliorationCardProps {
  amelioration: Amelioration;
  categoryLabels: Record<AmeliorationCategory, string>;
  onResolve: () => void;
  onIgnore: () => void;
  onNavigate: (taskId: string) => void;
}

export default function AmeliorationCard({
  amelioration,
  categoryLabels,
  onResolve,
  onIgnore,
  onNavigate,
}: AmeliorationCardProps) {
  const { t } = useTranslation();
  const status = amelioration.status ?? (amelioration.resolved ? 'resolved' : 'open');
  const categoryBorderColors: Record<AmeliorationCategory, string> = {
    capability: 'border-l-accent',
    access: 'border-l-orange',
    config: 'border-l-purple',
    process: 'border-l-green',
    data: 'border-l-[#64d2ff]',
  };
  const borderColor = status === 'resolved' ? 'border-l-green' : status === 'ignored' ? 'border-l-text-tertiary' : (amelioration.category ? categoryBorderColors[amelioration.category] : 'border-l-orange');

  return (
    <div className={`bg-card rounded-xl border-l-4 ${borderColor} p-3.5`}>
      {/* Header: title + badges + date */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-text">{amelioration.title}</h3>
          {amelioration.category && (
            <span className={`text-[12px] px-1.5 py-0.5 rounded-md font-medium ${categoryColors[amelioration.category]}`}>
              {categoryLabels[amelioration.category]}
            </span>
          )}
          {amelioration.source && (
            <span className="text-[12px] px-1.5 py-0.5 rounded-md bg-text-tertiary/10 text-text-tertiary font-medium">
              {amelioration.source}
            </span>
          )}
        </div>
        <span className="text-xs text-text-tertiary whitespace-nowrap">{amelioration.date}</span>
      </div>

      {/* Problem description */}
      <p className="text-sm text-text-secondary mb-3">{amelioration.problem}</p>

      {/* Impact */}
      {amelioration.impact && (
        <div className="bg-surface rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-text-tertiary">{t('ameliorations.impact')}</span>
          <p className="text-sm text-text-secondary">{amelioration.impact}</p>
        </div>
      )}

      {/* Recommended actions */}
      {amelioration.actions?.length > 0 && (
        <div className="bg-surface rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-text-tertiary">{t('ameliorations.recommendedActions')}</span>
          <ul className="mt-1 space-y-1">
            {amelioration.actions.map((action, i) => (
              <li key={i} className="text-sm text-text-secondary flex gap-2">
                <span className="text-accent shrink-0">→</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Legacy suggestion field (for old bullet-format gaps) */}
      {amelioration.suggestion && !amelioration.actions?.length && (
        <div className="bg-surface rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-text-tertiary">{t('ameliorations.suggestion')}</span>
          <p className="text-sm text-text-secondary">{amelioration.suggestion}</p>
        </div>
      )}

      {/* Footer: links + action buttons */}
      <div className="flex items-center gap-3 mt-3">
        {amelioration.taskId && (
          <button
            onClick={() => onNavigate(amelioration.taskId as string)}
            className="px-3 py-1.5 rounded-lg bg-card-hover text-sm text-text-secondary hover:text-text transition-colors"
          >
            Task: {amelioration.taskId} →
          </button>
        )}
        {amelioration.sessionId && (
          <span className="text-xs text-text-tertiary font-mono">
            session: {amelioration.sessionId.slice(0, 12)}…
          </span>
        )}
        <div className="flex-1" />
        {status === 'open' && (
          <>
            <button
              onClick={onResolve}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-tertiary hover:text-green hover:border-green transition-colors"
            >
              {t('common.resolved')}
            </button>
            <button
              onClick={onIgnore}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {t('common.ignore')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
