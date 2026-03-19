// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useNavigate } from 'react-router-dom';
import type { Session } from '@opentidy/shared';
import { useStore } from '../../shared/store';
import { formatDuration } from '../../shared/utils/format';
import { sessionStatusColors } from '../../shared/utils/status-colors';

export default function SessionCard({ session }: { session: Session }) {
  const navigate = useNavigate();
  const { dossiers } = useStore();
  const dossier = dossiers.find(d => d.id === session.dossierId);
  const dotColor = sessionStatusColors[session.status] ?? sessionStatusColors.finished;
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