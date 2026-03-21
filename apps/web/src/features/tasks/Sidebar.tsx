// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Task, Session } from '@opentidy/shared';
import { useStore } from '../../shared/store';
import { getArtifactUrl } from '../../shared/api';
import { formatDuration } from '../../shared/utils/format';
import { sessionStatusConfig } from '../../shared/utils/status-colors';

interface SidebarProps {
  task: Task;
  session?: Session;
}

export default function Sidebar({ task, session }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { stopSession } = useStore();
  const sessionDot = session ? (sessionStatusConfig[session.status]?.dot ?? 'bg-text-tertiary') : null;
  const sessionLabel = session ? t(`status.${session.status}`) : null;

  return (
    <aside className="w-[260px] shrink-0 space-y-6">
      {session && sessionDot && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('sidebar.session')}</h4>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${sessionDot}`} />
            <span className="text-sm text-green">{sessionLabel} - {formatDuration(session.startedAt)}</span>
          </div>
          <button
            onClick={() => navigate(`/terminal?session=${session.id}`)}
            className="mt-2 w-full py-1.5 text-sm rounded-lg border border-border text-text-secondary hover:bg-card-hover transition-colors duration-150"
          >
            {t('sidebar.openTerminal')}
          </button>
          <button
            onClick={() => stopSession(task.id)}
            className="mt-2 w-full py-2 text-sm font-medium rounded-lg bg-red/10 border border-red/30 text-red hover:bg-red/20 transition-colors"
          >
            {t('sidebar.stopSession')}
          </button>
        </div>
      )}

      {task.artifacts.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('common.files')}</h4>
          <ul className="space-y-1.5">
            {task.artifacts.map((file) => (
              <li key={file} className="flex items-center gap-2 text-sm">
                {file.endsWith('.md') ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
                <a
                  href={getArtifactUrl(task.id, file)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-secondary hover:text-accent hover:underline"
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