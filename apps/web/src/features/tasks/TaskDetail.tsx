// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useStore } from '../../shared/store';
import StateRenderer from './StateRenderer';
import InstructionBar from '../../shared/InstructionBar';
import { getArtifactUrl, getTerminalPort } from '../../shared/api';
import { TtydTerminal } from '../../shared/TtydTerminal';
import { formatDuration } from '../../shared/utils/format';
import { taskStatusConfig } from '../../shared/utils/status-colors';
import type { Task } from '@opentidy/shared';

function InfoPanel({ task }: { task: Task }) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 bg-[#161618]">
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('taskDetail.state')}</h4>
        <StateRenderer task={task} />
      </div>

      {/* Only show artifacts/journal when stateRaw is absent — StateRenderer already renders them from the markdown */}
      {!task.stateRaw && task.artifacts.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('common.files')} ({task.artifacts.length})</h4>
          <ul className="space-y-1">
            {task.artifacts.map((file) => (
              <li key={file} className="text-sm">
                <a href={getArtifactUrl(task.id, file)} target="_blank" rel="noopener noreferrer"
                  className="text-accent text-[11px] hover:underline">{file}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!task.stateRaw && task.journal && task.journal.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('taskDetail.log')}</h4>
          <div className="space-y-1">
            {task.journal.slice().reverse().map((entry, i) => (
              <div key={i} className="text-xs">
                <span className="text-[#48484a]">{entry.date}</span>
                <span className="text-text-secondary ml-1">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tasks, sessions, fetchTasks, fetchSessions, completeTask, stopSession, resumeSession } = useStore();
  const [ttydPort, setTtydPort] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchSessions()])
      .finally(() => setLoading(false));
  }, [fetchTasks, fetchSessions]);

  const task = tasks.find((d) => d.id === id);
  const session = sessions.find((s) => s.taskId === id);

  useEffect(() => {
    if (!session) { setTtydPort(null); return; }
    getTerminalPort(session.id).then(setTtydPort).catch(() => setTtydPort(null));
  }, [session?.id]);

  if (!task && loading) {
    return <div className="p-6 md:p-8 text-text-secondary">{t('common.loading')}</div>;
  }

  if (!task) {
    return (
      <div className="p-6 md:p-8 flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-text-secondary text-sm">{t('taskDetail.notFound')}</p>
        <button onClick={() => navigate('/')} className="text-accent text-sm hover:underline">
          {t('nav.home')}
        </button>
      </div>
    );
  }

  const isWaiting = session?.status === 'idle';
  const config = isWaiting
    ? taskStatusConfig['WAITING']
    : taskStatusConfig[task.status] ?? taskStatusConfig['IN_PROGRESS'];
  const hasTerminal = !!ttydPort;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/')} className="text-text-tertiary hover:text-text-secondary flex items-center gap-1 text-xs shrink-0">&larr;</button>
          <h1 className="text-sm font-semibold text-text truncate">{task.title}</h1>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${config.badgeBg} ${config.badge} shrink-0`}>{t(config.labelKey)}</span>
          {session && (
            <span className="text-[10px] text-[#48484a] bg-card px-2 py-0.5 rounded shrink-0">
              {formatDuration(session.startedAt)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {session && (
              <button
                onClick={() => stopSession(task.id)}
                className="bg-card text-text-secondary rounded-lg px-2.5 py-1 text-xs hover:text-red transition-colors"
              >
                {t('taskDetail.stop')}
              </button>
            )}
            {task.status !== 'COMPLETED' && (
              <button
                onClick={() => {
                  if (window.confirm(t('taskDetail.completeConfirm', { title: task.title }))) {
                    completeTask(task.id).then(() => navigate('/'));
                  }
                }}
                className="bg-card text-text-secondary rounded-lg px-2.5 py-1 text-xs hover:text-red transition-colors"
              >
                {t('taskDetail.complete')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content — resizable split */}
      <div className="flex-1 overflow-hidden">
        {hasTerminal ? (
          <PanelGroup direction="horizontal" autoSaveId={`task-${id}`}>
            {/* Info panel */}
            <Panel defaultSize={25} minSize={15} collapsible collapsedSize={0}>
              <InfoPanel task={task} />
            </Panel>

            {/* Resize handle */}
            <PanelResizeHandle className="w-[3px] bg-surface hover:bg-accent transition-colors cursor-col-resize" />

            {/* Terminal panel */}
            <Panel defaultSize={75} minSize={30}>
              <TtydTerminal port={ttydPort} />
            </Panel>
          </PanelGroup>
        ) : (
          /* No terminal — info left + empty terminal panel right */
          <PanelGroup direction="horizontal">
            <Panel defaultSize={30} minSize={15}>
              <InfoPanel task={task} />
            </Panel>

            <PanelResizeHandle className="w-[3px] bg-surface hover:bg-accent transition-colors cursor-col-resize" />

            <Panel defaultSize={70} minSize={30}>
              <div className="h-full bg-surface flex flex-col items-center justify-center gap-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#3a3a3c]">
                  <polyline points="4,17 10,11 4,5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <p className="text-text-secondary text-sm">{t('taskDetail.noActiveSession')}</p>
                {task.status === 'COMPLETED' ? (
                  <>
                    <p className="text-text-secondary text-xs mt-1">{t('taskDetail.taskCompleted')}</p>
                    <button
                      onClick={() => resumeSession(task.id)}
                      className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(10,132,255,0.2)] hover:bg-accent/90 transition-colors"
                    >
                      {t('taskDetail.reopenTask')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => resumeSession(task.id)}
                    className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(10,132,255,0.2)] hover:bg-accent/90 transition-colors"
                  >
                    {t('taskDetail.startSession')}
                  </button>
                )}
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* Instruction bar */}
      <InstructionBar taskId={task.id} />
    </div>
  );
}
