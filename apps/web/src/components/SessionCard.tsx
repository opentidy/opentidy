import { useNavigate } from 'react-router-dom';
import type { Session } from '@opentidy/shared';
import { useStore } from '../store';

const statusColors: Record<string, string> = {
  active: 'bg-green',
  idle: 'bg-accent',
  mfa: 'bg-orange',
  finished: 'bg-text-tertiary',
};

function formatDuration(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${mins % 60}m`;
}

export default function SessionCard({ session }: { session: Session }) {
  const navigate = useNavigate();
  const { dossiers } = useStore();
  const dossier = dossiers.find(d => d.id === session.dossierId);
  const dotColor = statusColors[session.status] ?? statusColors.finished;
  const label = dossier?.title || session.dossierId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      onClick={() => navigate(`/dossier/${encodeURIComponent(session.dossierId)}`)}
      className="bg-card rounded-xl p-3 flex items-center justify-between cursor-pointer hover:bg-card-hover transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
        <span className="text-sm text-text">{label}</span>
      </div>
      <span className="text-xs text-text-tertiary">{formatDuration(session.startedAt)}</span>
    </div>
  );
}
