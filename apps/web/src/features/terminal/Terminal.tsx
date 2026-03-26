// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import { SessionOutput } from '../sessions/SessionOutput';
import ProcessOutput from './ProcessOutput';
import LiveProcessOutput from './LiveProcessOutput';
import type { AgentProcess, AgentProcessType } from '@opentidy/shared';

const statusDot: Record<string, string> = {
  queued: 'bg-accent/50 animate-pulse',
  running: 'bg-green animate-pulse',
  done: 'bg-text-tertiary',
  error: 'bg-red',
};

const typeLabels: Record<AgentProcessType, string> = {
  triage: 'Triage',
  checkup: 'Checkup',
  title: 'Title',
  'memory-injection': 'Memory',
  'memory-extraction': 'Memory',
  'memory-prompt': 'Memory',
};

function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m${remaining > 0 ? ` ${remaining}s` : ''}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ProcessMetadata({ process }: { process: AgentProcess }) {
  const { t } = useTranslation();

  return (
    <div className="px-4 py-3 border-b border-border space-y-2">
      {/* Top row: type + status + timing */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[process.status]}`} />
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-card-hover text-text-secondary font-medium">
            {typeLabels[process.type] ?? process.type}
          </span>
          <span className={`text-xs font-medium ${
            process.status === 'running' ? 'text-green' :
            process.status === 'error' ? 'text-red' :
            process.status === 'queued' ? 'text-accent' :
            'text-text-tertiary'
          }`}>
            {t(`terminal.status${process.status.charAt(0).toUpperCase() + process.status.slice(1)}`)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-tertiary ml-auto">
          {process.pid && <span>PID {process.pid}</span>}
          <span>{formatTime(process.startedAt)}</span>
          {(process.endedAt || process.status === 'running') && (
            <span className="font-mono">{formatDuration(process.startedAt, process.endedAt)}</span>
          )}
          {process.exitCode != null && (
            <span className={process.exitCode === 0 ? 'text-green' : 'text-red'}>
              exit {process.exitCode}
            </span>
          )}
        </div>
      </div>

      {/* Task ID if present */}
      {process.taskId && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-tertiary">{t('terminal.linkedTask')}</span>
          <span className="font-mono text-accent">{process.taskId}</span>
        </div>
      )}

      {/* Description if different from instruction */}
      {process.description && !process.instruction && (
        <p className="text-xs text-text-secondary">{process.description}</p>
      )}

      {/* Instruction / prompt */}
      {process.instruction && (
        <div>
          <p className="text-xs text-text-tertiary mb-1">{t('terminal.prompt')}</p>
          <pre className="text-xs text-text-secondary whitespace-pre-wrap bg-[#0f0f11] rounded p-2 max-h-48 overflow-y-auto">
            {process.instruction}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Terminal() {
  const { t } = useTranslation();
  const { claudeProcesses, fetchClaudeProcesses } = useStore();
  const [filter, setFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(claudeProcesses.length === 0);

  useEffect(() => {
    fetchClaudeProcesses().finally(() => setLoading(false));
    const interval = setInterval(fetchClaudeProcesses, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-select most recent process if nothing is selected
  useEffect(() => {
    if (selectedId === null && claudeProcesses.length > 0) {
      setSelectedId(claudeProcesses[0].id);
    }
  }, [selectedId, claudeProcesses]);

  const filtered = filter ? claudeProcesses.filter(p => p.type === filter) : claudeProcesses;
  const selected = claudeProcesses.find(p => p.id === selectedId);

  const types: AgentProcessType[] = ['triage', 'checkup', 'title', 'memory-injection', 'memory-extraction', 'memory-prompt'];

  const queuedCount = claudeProcesses.filter(p => p.status === 'queued').length;
  const runningCount = claudeProcesses.filter(p => p.status === 'running').length;

  // Empty state: no processes at all
  if (!loading && claudeProcesses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-card-hover flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-sm font-medium text-text mb-1">{t('terminal.noProcesses')}</h2>
          <p className="text-xs text-text-tertiary leading-relaxed">{t('terminal.noProcessesDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left panel: process list */}
      <div className={`${selected ? 'w-80 shrink-0' : 'w-full max-w-2xl mx-auto'} border-r border-border flex flex-col h-full transition-all`}>
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-sm font-semibold text-text">{t('terminal.title')}</h1>
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              {runningCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                  {runningCount}
                </span>
              )}
              {queuedCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-pulse" />
                  {queuedCount}
                </span>
              )}
              <span className="text-text-tertiary/50">{claudeProcesses.length}</span>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setFilter('')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${!filter ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary'}`}>
              {t('terminal.all')}
            </button>
            {types.map(tp => {
              const count = claudeProcesses.filter(p => p.type === tp).length;
              if (count === 0) return null;
              return (
                <button key={tp} onClick={() => setFilter(tp)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${filter === tp ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary'}`}>
                  {typeLabels[tp] ?? tp} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Process list */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {loading && filtered.length === 0 && (
            <p className="text-text-tertiary text-xs italic py-4 px-2 animate-pulse">{t('common.loading')}</p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-text-tertiary text-xs italic py-4 px-2">{t('terminal.noProcesses')}</p>
          )}
          {filtered.map(p => (
            <button key={p.id} onClick={() => setSelectedId(p.id)}
              className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                selectedId === p.id ? 'bg-accent/[.08] ring-1 ring-accent/30' : 'hover:bg-card-hover'
              }`}>
              {/* Row 1: status + type + time */}
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[p.status] ?? 'bg-text-tertiary'}`} />
                <span className="font-mono text-xs text-text-secondary font-medium">{typeLabels[p.type] ?? p.type}</span>
                {p.status === 'queued' && <span className="text-[10px] text-accent/60 italic">{t('terminal.statusQueued').toLowerCase()}</span>}
                <span className="ml-auto text-text-tertiary text-[10px] tabular-nums shrink-0">
                  {formatTime(p.startedAt)}
                  {(p.endedAt || p.status === 'running') && (
                    <> · {formatDuration(p.startedAt, p.endedAt)}</>
                  )}
                </span>
              </div>
              {/* Row 2: description / instruction preview */}
              {(p.description || p.instruction || p.taskId) && (
                <p className="text-[11px] text-text-tertiary truncate mt-0.5 pl-3.5">
                  {p.description ?? p.instruction?.slice(0, 120) ?? p.taskId}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: detail */}
      {selected && (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Metadata header */}
          <ProcessMetadata process={selected} />

          {/* Output area */}
          <div className="flex-1 min-h-0">
            {selected.status === 'queued' && (
              <div className="flex items-center justify-center h-full text-text-tertiary">
                <div className="text-center">
                  <div className="w-4 h-4 rounded-full bg-accent/30 animate-pulse mx-auto mb-2" />
                  <p className="text-sm">{t('terminal.waitingForSlot')}</p>
                </div>
              </div>
            )}
            {selected.status === 'running' && selected.taskId && (
              <SessionOutput taskId={selected.taskId} />
            )}
            {selected.status === 'running' && !selected.taskId && (
              <LiveProcessOutput trackId={selected.id} processType={selected.type} />
            )}
            {(selected.status === 'done' || selected.status === 'error') && (
              <ProcessOutput processId={selected.id} status={selected.status} exitCode={selected.exitCode} startedAt={selected.startedAt} endedAt={selected.endedAt} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
