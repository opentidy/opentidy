// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Task, Session } from '@opentidy/shared';
import { taskStatusConfig } from '../../shared/utils/status-colors';

export default function TaskCard({ task, session }: { task: Task; session?: Session }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isWaiting = session?.status === 'idle';
  const displayStatus = isWaiting ? 'WAITING' : task.status;
  const config = taskStatusConfig[displayStatus] ?? taskStatusConfig['IN_PROGRESS'];
  const isFinished = task.status === 'COMPLETED';

  return (
    <div
      onClick={() => navigate(`/task/${task.id}`)}
      className={`bg-card rounded-xl p-3 cursor-pointer hover:bg-card-hover transition-colors duration-150 ${isFinished ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <span className={`w-[7px] h-[7px] rounded-full ${config.dot} shrink-0`} />
            <span className="text-sm font-medium text-text truncate">{task.title}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${config.badgeBg} ${config.badge} shrink-0 whitespace-nowrap`}>
              {t(config.labelKey)}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5 truncate">{task.objective}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          {session?.status === 'active' && (
            <span className="flex items-center gap-1 text-[9px] text-green">
              <span className="w-1 h-1 rounded-full bg-green animate-pulse" />
              Terminal
            </span>
          )}
          <div className="text-[9px] text-[#48484a]">{task.lastAction}</div>
        </div>
      </div>
    </div>
  );
}