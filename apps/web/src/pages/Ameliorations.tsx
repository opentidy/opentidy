import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { Amelioration, AmeliorationStatus, AmeliorationCategory } from '@opentidy/shared';

type Filter = 'ouverts' | 'resolus' | 'ignores';

const filterLabels: Record<Filter, string> = {
  ouverts: 'Ouverts',
  resolus: 'Résolus',
  ignores: 'Ignorés',
};

const categoryLabels: Record<AmeliorationCategory, string> = {
  capability: 'Capacité',
  access: 'Accès',
  config: 'Config',
  process: 'Process',
  data: 'Données',
};

const categoryColors: Record<AmeliorationCategory, string> = {
  capability: 'bg-purple-500/15 text-purple-400',
  access: 'bg-red-500/15 text-red-400',
  config: 'bg-blue-500/15 text-blue-400',
  process: 'bg-yellow-500/15 text-yellow-400',
  data: 'bg-emerald-500/15 text-emerald-400',
};

export default function Ameliorations() {
  const navigate = useNavigate();
  const { ameliorations, fetchAmeliorations, resolveAmelioration, ignoreAmelioration } = useStore();
  const [filter, setFilter] = useState<Filter>('ouverts');
  const [loading, setLoading] = useState(ameliorations.length === 0);

  useEffect(() => { fetchAmeliorations().finally(() => setLoading(false)); }, [fetchAmeliorations]);

  const statusForFilter: Record<Filter, AmeliorationStatus> = {
    ouverts: 'open',
    resolus: 'resolved',
    ignores: 'ignored',
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
          <h1 className="text-xl font-bold text-text">Auto-analyses</h1>
          <span className="text-xs px-2 py-0.5 rounded-md bg-text-tertiary/20 text-text-tertiary font-medium">
            {loading ? '...' : `${openCount} ouverte${openCount !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex gap-2">
          {(['ouverts', 'resolus', 'ignores'] as Filter[]).map((f) => (
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
            onResolve={() => resolveAmelioration(amelioration.id)}
            onIgnore={() => ignoreAmelioration(amelioration.id)}
            onNavigate={(dossierId) => navigate(`/dossier/${dossierId}`)}
          />
        ))}
        {loading && filtered.length === 0 && (
          <p className="text-text-tertiary text-sm py-8 text-center animate-pulse">
            Chargement...
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-text-tertiary text-sm py-8 text-center">
            Aucune analyse {filter === 'ouverts' ? 'ouverte' : filter === 'resolus' ? 'résolue' : 'ignorée'}
          </p>
        )}
      </div>
    </div>
  );
}

function AmeliorationCard({
  amelioration,
  onResolve,
  onIgnore,
  onNavigate,
}: {
  amelioration: Amelioration;
  onResolve: () => void;
  onIgnore: () => void;
  onNavigate: (dossierId: string) => void;
}) {
  const status = amelioration.status ?? (amelioration.resolved ? 'resolved' : 'open');
  const borderColor = status === 'resolved' ? 'border-l-green' : status === 'ignored' ? 'border-l-text-tertiary' : 'border-l-orange';

  return (
    <div className={`bg-card rounded-xl border-l-4 ${borderColor} p-5`}>
      {/* Header: title + badges + date */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-text">{amelioration.title}</h3>
          {amelioration.category && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${categoryColors[amelioration.category]}`}>
              {categoryLabels[amelioration.category]}
            </span>
          )}
          {amelioration.source && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-text-tertiary/10 text-text-tertiary font-medium">
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
        <div className="bg-bg rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-text-tertiary">Impact</span>
          <p className="text-sm text-text-secondary">{amelioration.impact}</p>
        </div>
      )}

      {/* Recommended actions */}
      {amelioration.actions?.length > 0 && (
        <div className="bg-bg rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-text-tertiary">Actions recommandées</span>
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
        <div className="bg-bg rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-text-tertiary">Suggestion</span>
          <p className="text-sm text-text-secondary">{amelioration.suggestion}</p>
        </div>
      )}

      {/* Footer: links + action buttons */}
      <div className="flex items-center gap-3 mt-3">
        {amelioration.dossierId && (
          <button
            onClick={() => onNavigate(amelioration.dossierId!)}
            className="px-3 py-1.5 rounded-lg bg-card-hover text-sm text-text-secondary hover:text-text transition-colors"
          >
            Dossier: {amelioration.dossierId} →
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
              Résolu
            </button>
            <button
              onClick={onIgnore}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Ignorer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
