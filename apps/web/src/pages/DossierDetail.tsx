import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useStore } from '../store';
import StateRenderer from '../components/StateRenderer';
import InstructionBar from '../components/InstructionBar';
import { getArtifactUrl, getTerminalPort, resumeSession } from '../api';

const statusConfig: Record<string, { badge: string; badgeBg: string; label: string }> = {
  'EN COURS': { badge: 'text-green', badgeBg: 'bg-green/20', label: 'En cours' },
  'TERMINÉ': { badge: 'text-text-tertiary', badgeBg: 'bg-text-tertiary/20', label: 'Termine' },
};

const sessionStatusConfig: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-green', label: 'Active' },
  idle: { dot: 'bg-accent', label: 'En attente' },
};

function formatDuration(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60}m`;
}

export default function DossierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dossiers, sessions, fetchDossiers, fetchSessions, completeDossier, stopSession } = useStore();
  const [ttydPort, setTtydPort] = useState<number | null>(null);

  useEffect(() => {
    fetchDossiers();
    fetchSessions();
  }, [fetchDossiers, fetchSessions]);

  const dossier = dossiers.find((d) => d.id === id);
  const session = sessions.find((s) => s.dossierId === id);

  useEffect(() => {
    if (!session) { setTtydPort(null); return; }
    getTerminalPort(session.id).then(setTtydPort).catch(() => setTtydPort(null));
  }, [session?.id]);

  if (!dossier) {
    return <div className="p-6 md:p-8 text-text-secondary">Chargement...</div>;
  }

  const isWaiting = session?.status === 'idle';
  const config = isWaiting
    ? { badge: 'text-orange', badgeBg: 'bg-orange/20', label: 'En attente' }
    : statusConfig[dossier.status] ?? statusConfig['EN COURS'];
  const hasTerminal = !!ttydPort;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 pt-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className="text-accent text-sm hover:underline shrink-0">&larr;</button>
          <h1 className="text-sm font-bold text-text truncate">{dossier.title}</h1>
          <span className={`text-xs px-1.5 py-0.5 rounded ${config.badgeBg} ${config.badge} font-medium shrink-0`}>{config.label}</span>
          {session && (
            <span className="text-xs text-text-tertiary shrink-0">
              {formatDuration(session.startedAt)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {session && (
              <button
                onClick={() => stopSession(dossier.id)}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-text-tertiary hover:text-red hover:border-red transition-colors"
              >
                Stopper
              </button>
            )}
            {dossier.status !== 'TERMINÉ' && (
              <button
                onClick={() => {
                  if (window.confirm(`Terminer "${dossier.title}" ?`)) {
                    completeDossier(dossier.id).then(() => navigate('/'));
                  }
                }}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-text-tertiary hover:text-red hover:border-red transition-colors"
              >
                Terminer
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Content — resizable split */}
      <div className="flex-1 overflow-hidden">
        {hasTerminal ? (
          <PanelGroup direction="horizontal" autoSaveId={`dossier-${id}`}>
            {/* Info panel */}
            <Panel defaultSize={25} minSize={15} collapsible collapsedSize={0}>
              <div className="h-full overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Etat</h4>
                  <StateRenderer dossier={dossier} />
                </div>

                {dossier.artifacts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Fichiers ({dossier.artifacts.length})</h4>
                    <ul className="space-y-1">
                      {dossier.artifacts.map((file) => (
                        <li key={file} className="text-sm">
                          <a href={getArtifactUrl(dossier.id, file)} target="_blank" rel="noopener noreferrer"
                            className="hover:underline text-text-secondary hover:text-accent">{file}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {dossier.journal && dossier.journal.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Journal</h4>
                    <div className="space-y-1">
                      {dossier.journal.slice().reverse().map((entry, i) => (
                        <div key={i} className="text-xs">
                          <span className="text-text-tertiary">{entry.date}</span>
                          <span className="text-text-secondary ml-1">{entry.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            {/* Resize handle */}
            <PanelResizeHandle className="w-1.5 bg-border hover:bg-accent/50 active:bg-accent transition-colors cursor-col-resize" />

            {/* Terminal panel */}
            <Panel defaultSize={75} minSize={30}>
              <iframe
                src={`http://localhost:${ttydPort}`}
                className="w-full h-full border-0 bg-black"
                title="Terminal"
              />
            </Panel>
          </PanelGroup>
        ) : (
          /* No terminal — info left + empty terminal panel right */
          <PanelGroup direction="horizontal">
            <Panel defaultSize={30} minSize={15}>
              <div className="h-full overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Etat</h4>
                  <StateRenderer dossier={dossier} />
                </div>

                {dossier.artifacts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Fichiers ({dossier.artifacts.length})</h4>
                    <ul className="space-y-1">
                      {dossier.artifacts.map((file) => (
                        <li key={file} className="text-sm">
                          <a href={getArtifactUrl(dossier.id, file)} target="_blank" rel="noopener noreferrer"
                            className="hover:underline text-text-secondary hover:text-accent">{file}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {dossier.journal && dossier.journal.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Journal</h4>
                    <div className="space-y-1">
                      {dossier.journal.slice().reverse().map((entry, i) => (
                        <div key={i} className="text-xs">
                          <span className="text-text-tertiary">{entry.date}</span>
                          <span className="text-text-secondary ml-1">{entry.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-border hover:bg-accent/50 active:bg-accent transition-colors cursor-col-resize" />

            <Panel defaultSize={70} minSize={30}>
              <div className="h-full bg-[#1a1a2e] flex flex-col items-center justify-center gap-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4a4a6a" strokeWidth="1.5" className="opacity-60">
                  <polyline points="4,17 10,11 4,5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <p className="text-[#6a6a8a] text-sm">Pas de session active</p>
                {dossier.status === 'TERMINÉ' ? (
                  <>
                    <p className="text-[#6a6a8a] text-xs mt-1">Ce dossier est termine. Reouvre-le pour lancer une session.</p>
                    <button
                      onClick={() => resumeSession(dossier.id).then(() => { fetchSessions(); fetchDossiers(); })}
                      className="px-4 py-2 rounded-lg border border-[#3a3a5a] text-[#8a8aaa] text-sm hover:border-accent hover:text-accent transition-colors"
                    >
                      Reouvrir le dossier
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => resumeSession(dossier.id).then(() => { fetchSessions(); fetchDossiers(); })}
                    className="px-4 py-2 rounded-lg border border-[#3a3a5a] text-[#8a8aaa] text-sm hover:border-accent hover:text-accent transition-colors"
                  >
                    Demarrer une session
                  </button>
                )}
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* Instruction bar */}
      <InstructionBar dossierId={dossier.id} />
    </div>
  );
}
