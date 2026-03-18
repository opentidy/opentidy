import { useNavigate } from 'react-router-dom';
import type { Dossier, Session } from '@alfred/shared';
import { useStore } from '../store';
import { getArtifactUrl } from '../api';

interface SidebarProps {
  dossier: Dossier;
  session?: Session;
}

const statusColors: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-green', label: 'Active' },
  idle: { dot: 'bg-accent', label: 'Idle' },
};

function formatDuration(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60}m`;
}

export default function Sidebar({ dossier, session }: SidebarProps) {
  const navigate = useNavigate();
  const { stopSession } = useStore();
  const sessionConfig = session ? (statusColors[session.status] ?? statusColors.finished) : null;

  return (
    <aside className="w-[260px] shrink-0 space-y-6">
      {session && sessionConfig && (
        <div>
          <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Session</h4>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${sessionConfig.dot}`} />
            <span className="text-sm text-green">{sessionConfig.label} - {formatDuration(session.startedAt)}</span>
          </div>
          <button
            onClick={() => navigate(`/terminal?session=${session.id}`)}
            className="mt-2 w-full py-1.5 text-sm rounded-lg border border-border text-text-secondary hover:bg-card-hover transition-colors"
          >
            Ouvrir le terminal
          </button>
          <button
            onClick={() => stopSession(dossier.id)}
            className="mt-2 w-full py-2 text-sm font-medium rounded-lg bg-red/10 border border-red/30 text-red hover:bg-red/20 transition-colors"
          >
            Stopper la session
          </button>
        </div>
      )}

      {dossier.artifacts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Fichiers</h4>
          <ul className="space-y-1.5">
            {dossier.artifacts.map((file) => (
              <li key={file} className="flex items-center gap-2 text-sm">
                {file.endsWith('.md') ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
                <a
                  href={getArtifactUrl(dossier.id, file)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-text-secondary hover:text-accent"
                >
                  {file}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
