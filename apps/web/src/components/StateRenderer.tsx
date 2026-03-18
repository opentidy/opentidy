import type { Dossier } from '@opentidy/shared';
import { getArtifactUrl } from '../api';

function MarkdownContent({ raw }: { raw: string }) {
  const lines = raw.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();

        // H1
        if (trimmed.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-text mt-4 mb-1">{trimmed.slice(2)}</h2>;
        // H2
        if (trimmed.startsWith('## ')) return <h3 key={i} className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mt-4 mb-1">{trimmed.slice(3)}</h3>;
        // H3
        if (trimmed.startsWith('### ')) return <h4 key={i} className="text-sm font-semibold text-text mt-3 mb-1">{trimmed.slice(4)}</h4>;
        // Status line
        if (trimmed.startsWith('STATUT') || trimmed.startsWith('MODE')) return null;
        // List item
        if (trimmed.startsWith('- ')) {
          const indent = line.length - trimmed.length;
          return (
            <div key={i} className="flex items-start gap-2 text-sm text-text-secondary" style={{ paddingLeft: `${indent * 4}px` }}>
              <span className="text-text-tertiary mt-1.5 shrink-0">·</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }
        // Empty line
        if (!trimmed) return <div key={i} className="h-2" />;
        // Normal text
        return <p key={i} className="text-sm text-text-secondary">{line}</p>;
      })}
    </div>
  );
}

export default function StateRenderer({ dossier }: { dossier: Dossier }) {
  // If we have raw state.md content, render it directly
  if (dossier.stateRaw) {
    return (
      <div className="space-y-6">
        <MarkdownContent raw={dossier.stateRaw} />

        {dossier.artifacts.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Fichiers</h3>
            <ul className="space-y-1">
              {dossier.artifacts.map((artifact) => (
                <li key={artifact} className="flex items-center gap-2 text-sm text-text-secondary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                  <a
                    href={getArtifactUrl(dossier.id, artifact)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-accent"
                  >
                    {artifact}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Fallback: structured rendering
  const isTermine = dossier.status === 'TERMINÉ';
  const lastEntry = dossier.journal?.[dossier.journal.length - 1];

  return (
    <div className="space-y-6">
      {lastEntry && dossier.journal.length > 1 && (
        <div className={`rounded-xl p-4 ${isTermine ? 'bg-green/10 border border-green/20' : 'bg-accent/10 border border-accent/20'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isTermine ? 'text-green' : 'text-accent'}`}>
              {isTermine ? 'Terminé' : 'Dernière action'}
            </span>
            <span className="text-xs text-text-tertiary">{lastEntry.date}</span>
          </div>
          <p className={`text-sm ${isTermine ? 'text-green' : 'text-text'}`}>{lastEntry.text}</p>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Objectif</h3>
        <p className="text-text-secondary">{dossier.objective}</p>
      </div>

      {dossier.journal && dossier.journal.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Journal</h3>
          <div className="space-y-2">
            {dossier.journal.slice().reverse().map((entry, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-text-tertiary text-xs w-20 shrink-0 pt-0.5">{entry.date}</span>
                <span className="text-text-secondary">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dossier.artifacts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Fichiers</h3>
          <ul className="space-y-1">
            {dossier.artifacts.map((artifact) => (
              <li key={artifact} className="flex items-center gap-2 text-sm text-text-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
                <a
                  href={getArtifactUrl(dossier.id, artifact)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:text-accent"
                >
                  {artifact}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
