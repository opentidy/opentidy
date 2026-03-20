// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useStore } from '../../shared/store';
import StateRenderer from './StateRenderer';
import InstructionBar from '../../shared/InstructionBar';
import { getArtifactUrl, getTerminalPort, resumeSession } from '../../shared/api';
import { formatDuration } from '../../shared/utils/format';
import { jobStatusConfig } from '../../shared/utils/status-colors';
import type { Job } from '@opentidy/shared';

function InfoPanel({ job }: { job: Job }) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">{t('jobDetail.state')}</h4>
        <StateRenderer job={job} />
      </div>

      {/* Only show artifacts/journal when stateRaw is absent — StateRenderer already renders them from the markdown */}
      {!job.stateRaw && job.artifacts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">{t('common.files')} ({job.artifacts.length})</h4>
          <ul className="space-y-1">
            {job.artifacts.map((file) => (
              <li key={file} className="text-sm">
                <a href={getArtifactUrl(job.id, file)} target="_blank" rel="noopener noreferrer"
                  className="hover:underline text-text-secondary hover:text-accent">{file}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!job.stateRaw && job.journal && job.journal.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">{t('jobDetail.log')}</h4>
          <div className="space-y-1">
            {job.journal.slice().reverse().map((entry, i) => (
              <div key={i} className="text-xs">
                <span className="text-text-tertiary">{entry.date}</span>
                <span className="text-text-secondary ml-1">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { jobs, sessions, fetchJobs, fetchSessions, completeJob, stopSession } = useStore();
  const [ttydPort, setTtydPort] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(
    () => localStorage.getItem('opentidy-first-task') === 'true'
  );

  useEffect(() => {
    Promise.all([fetchJobs(), fetchSessions()])
      .finally(() => setLoading(false));
  }, [fetchJobs, fetchSessions]);

  const job = jobs.find((d) => d.id === id);
  const session = sessions.find((s) => s.jobId === id);

  useEffect(() => {
    if (!session) { setTtydPort(null); return; }
    getTerminalPort(session.id).then(setTtydPort).catch(() => setTtydPort(null));
  }, [session?.id]);

  if (!job && loading) {
    return <div className="p-6 md:p-8 text-text-secondary">{t('common.loading')}</div>;
  }

  if (!job) {
    return (
      <div className="p-6 md:p-8 flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-text-secondary text-sm">{t('jobDetail.notFound')}</p>
        <button onClick={() => navigate('/')} className="text-accent text-sm hover:underline">
          {t('nav.home')}
        </button>
      </div>
    );
  }

  const isWaiting = session?.status === 'idle';
  const config = isWaiting
    ? jobStatusConfig['WAITING']
    : jobStatusConfig[job.status] ?? jobStatusConfig['IN_PROGRESS'];
  const hasTerminal = !!ttydPort;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 pt-3 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className="text-accent text-sm hover:underline shrink-0">&larr;</button>
          <h1 className="text-sm font-bold text-text truncate">{job.title}</h1>
          <span className={`text-xs px-1.5 py-0.5 rounded ${config.badgeBg} ${config.badge} font-medium shrink-0`}>{t(config.labelKey)}</span>
          {session && (
            <span className="text-xs text-text-tertiary shrink-0">
              {formatDuration(session.startedAt)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {session && (
              <button
                onClick={() => stopSession(job.id)}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-text-tertiary hover:text-red hover:border-red transition-colors"
              >
                {t('jobDetail.stop')}
              </button>
            )}
            {job.status !== 'COMPLETED' && (
              <button
                onClick={() => {
                  if (window.confirm(t('jobDetail.completeConfirm', { title: job.title }))) {
                    completeJob(job.id).then(() => navigate('/'));
                  }
                }}
                className="px-2.5 py-1 rounded-lg border border-border text-xs text-text-tertiary hover:text-red hover:border-red transition-colors"
              >
                {t('jobDetail.complete')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Post-creation banner */}
      {showBanner && (
        <div className="mx-4 md:mx-6 mt-2 bg-green/10 border border-green/20 rounded-lg px-4 py-3 flex items-start gap-3">
          <p className="text-sm text-text-secondary flex-1">{t('onboarding.postCreationBanner')}</p>
          <button
            aria-label="dismiss"
            onClick={() => {
              localStorage.removeItem('opentidy-first-task');
              setShowBanner(false);
            }}
            className="text-text-tertiary hover:text-text transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Content — resizable split */}
      <div className="flex-1 overflow-hidden">
        {hasTerminal ? (
          <PanelGroup direction="horizontal" autoSaveId={`job-${id}`}>
            {/* Info panel */}
            <Panel defaultSize={25} minSize={15} collapsible collapsedSize={0}>
              <InfoPanel job={job} />
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
              <InfoPanel job={job} />
            </Panel>

            <PanelResizeHandle className="w-1.5 bg-border hover:bg-accent/50 active:bg-accent transition-colors cursor-col-resize" />

            <Panel defaultSize={70} minSize={30}>
              <div className="h-full bg-[#1a1a2e] flex flex-col items-center justify-center gap-4">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4a4a6a" strokeWidth="1.5" className="opacity-60">
                  <polyline points="4,17 10,11 4,5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <p className="text-[#6a6a8a] text-sm">{t('jobDetail.noActiveSession')}</p>
                {job.status === 'COMPLETED' ? (
                  <>
                    <p className="text-[#6a6a8a] text-xs mt-1">{t('jobDetail.jobCompleted')}</p>
                    <button
                      onClick={() => resumeSession(job.id).then(() => { fetchSessions(); fetchJobs(); })}
                      className="px-4 py-2 rounded-lg border border-[#3a3a5a] text-[#8a8aaa] text-sm hover:border-accent hover:text-accent transition-colors"
                    >
                      {t('jobDetail.reopenJob')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => resumeSession(job.id).then(() => { fetchSessions(); fetchJobs(); })}
                    className="px-4 py-2 rounded-lg border border-[#3a3a5a] text-[#8a8aaa] text-sm hover:border-accent hover:text-accent transition-colors"
                  >
                    {t('jobDetail.startSession')}
                  </button>
                )}
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* Instruction bar */}
      <InstructionBar jobId={job.id} />
    </div>
  );
}
