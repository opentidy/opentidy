// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Job, Session } from '@opentidy/shared';
import { jobStatusConfig } from '../../shared/utils/status-colors';

export default function JobCard({ job, session }: { job: Job; session?: Session }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isWaiting = session?.status === 'idle';
  const displayStatus = isWaiting ? 'WAITING' : job.status;
  const config = jobStatusConfig[displayStatus] ?? jobStatusConfig['IN_PROGRESS'];
  const isFinished = job.status === 'COMPLETED';

  return (
    <div
      onClick={() => navigate(`/job/${job.id}`)}
      className={`bg-card rounded-xl p-4 cursor-pointer hover:bg-card-hover transition-colors ${isFinished ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <span className={`w-2 h-2 rounded-full ${config.dot} shrink-0`} />
            <span className="font-semibold text-text truncate">{job.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-md ${config.badgeBg} ${config.badge} font-medium shrink-0 whitespace-nowrap`}>
              {t(config.labelKey)}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">{job.objective}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          {session?.status === 'active' && (
            <span className="flex items-center gap-1 text-xs text-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              Terminal
            </span>
          )}
          <div className="text-xs text-text-tertiary">{job.lastAction}</div>
        </div>
      </div>
    </div>
  );
}