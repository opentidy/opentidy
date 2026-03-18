import { useState } from 'react';
import type { Suggestion } from '@opentidy/shared';
import { useStore } from '../store';

const urgencyColors: Record<string, { border: string; badge: string; badgeBg: string; dot: string }> = {
  urgent: { border: 'border-l-red', badge: 'text-red', badgeBg: 'bg-red/20', dot: 'bg-red' },
  normal: { border: 'border-l-accent', badge: 'text-accent', badgeBg: 'bg-accent/20', dot: 'bg-accent' },
  faible: { border: 'border-l-text-tertiary', badge: 'text-text-tertiary', badgeBg: 'bg-text-tertiary/20', dot: 'bg-text-tertiary' },
};

const sourceIcons: Record<string, string> = {
  gmail: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  checkup: 'Checkup',
  app: 'App',
};

export default function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { approveSuggestion, ignoreSuggestion } = useStore();
  const colors = urgencyColors[suggestion.urgency] ?? urgencyColors.normal;
  const [expanded, setExpanded] = useState(false);
  const sourceLabel = sourceIcons[suggestion.source] ?? suggestion.source;

  return (
    <div className={`bg-card rounded-xl border-l-4 ${colors.border} p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
            <span className="font-semibold text-text">{suggestion.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-md ${colors.badgeBg} ${colors.badge} font-medium capitalize`}>
              {suggestion.urgency}
            </span>
          </div>
          {/* Source + date */}
          <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
            {sourceLabel && <span className="px-1.5 py-0.5 rounded bg-surface-hover">{sourceLabel}</span>}
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
            Voir le message original
          </button>
          {expanded && (
            <pre className="mt-2 p-3 bg-surface rounded-lg text-xs text-text-secondary whitespace-pre-wrap font-sans border border-border">
              {suggestion.context}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => approveSuggestion(suggestion.slug)}
          className="flex-1 py-2 text-sm font-medium rounded-lg bg-green text-white hover:bg-green/90 transition-colors"
        >
          Creer le dossier
        </button>
        <button
          onClick={() => ignoreSuggestion(suggestion.slug)}
          className="flex-1 py-2 text-sm rounded-lg border border-border text-text-secondary hover:bg-card-hover transition-colors"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}
