import { useNavigate } from 'react-router-dom';
import type { Dossier, Session } from '@opentidy/shared';

const statusConfig: Record<string, { dot: string; badge: string; badgeBg: string; label: string }> = {
  'EN COURS': { dot: 'bg-green', badge: 'text-green', badgeBg: 'bg-green/20', label: 'En cours' },
  'EN ATTENTE': { dot: 'bg-orange', badge: 'text-orange', badgeBg: 'bg-orange/20', label: 'En attente' },
  'TERMINÉ': { dot: 'bg-text-tertiary', badge: 'text-text-tertiary', badgeBg: 'bg-text-tertiary/20', label: 'Termine' },
};

export default function DossierCard({ dossier, session }: { dossier: Dossier; session?: Session }) {
  const navigate = useNavigate();
  const isWaiting = session?.status === 'idle';
  const displayStatus = isWaiting ? 'EN ATTENTE' : dossier.status;
  const config = statusConfig[displayStatus] ?? statusConfig['EN COURS'];
  const isFinished = dossier.status === 'TERMINÉ';

  return (
    <div
      onClick={() => navigate(`/dossier/${dossier.id}`)}
      className={`bg-card rounded-xl p-4 cursor-pointer hover:bg-card-hover transition-colors ${isFinished ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${config.dot} shrink-0`} />
            <span className="font-semibold text-text">{dossier.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-md ${config.badgeBg} ${config.badge} font-medium`}>
              {config.label}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">{dossier.objective}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          {session?.status === 'active' && (
            <span className="flex items-center gap-1 text-xs text-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              Terminal
            </span>
          )}
          <div className="text-xs text-text-tertiary">{dossier.lastAction}</div>
        </div>
      </div>
    </div>
  );
}
