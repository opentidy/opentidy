// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import { SessionOutput } from '../sessions/SessionOutput';
import ProcessOutput from './ProcessOutput';
import LiveProcessOutput from './LiveProcessOutput';
import type { AgentProcessType } from '@opentidy/shared';

const statusDot: Record<string, string> = {
  queued: 'bg-accent/50',
  running: 'bg-green animate-pulse',
  done: 'bg-text-tertiary',
  error: 'bg-red',
};

const statusLabelKey: Record<string, string> = {
  queued: 'terminal.statusQueued',
  running: 'terminal.statusRunning',
  done: 'terminal.statusDone',
  error: 'terminal.statusError',
};

export default function Terminal() {
  const { t } = useTranslation();
  const { claudeProcesses, fetchClaudeProcesses } = useStore();
  const [filter, setFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(claudeProcesses.length === 0);

  // Empty deps is intentional: fetchClaudeProcesses is a stable Zustand selector reference
  // that never changes identity, so including it would be redundant.
  useEffect(() => {
    fetchClaudeProcesses().finally(() => setLoading(false));
    const interval = setInterval(fetchClaudeProcesses, 5_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = filter ? claudeProcesses.filter(p => p.type === filter) : claudeProcesses;
  const selected = claudeProcesses.find(p => p.id === selectedId);

  const types: AgentProcessType[] = ['triage', 'checkup', 'title', 'memory-injection', 'memory-extraction', 'memory-prompt'];

  const queuedCount = claudeProcesses.filter(p => p.status === 'queued').length;
  const runningCount = claudeProcesses.filter(p => p.status === 'running').length;
  const doneCount = claudeProcesses.filter(p => p.status === 'done').length;

  return (
    <div className="flex h-full">
      {/* Left panel — process list */}
      <div className={`${selected ? 'w-1/3 border-r border-border' : 'w-full max-w-2xl mx-auto'} p-4 overflow-y-auto transition-all`}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-text">{t('terminal.title')}</h1>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {runningCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />{t('terminal.activeCount', { count: runningCount })}</span>}
            {queuedCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent/50" />{t('terminal.queuedCount', { count: queuedCount })}</span>}
            {doneCount > 0 && <span>{t('terminal.doneCount', { count: doneCount })}</span>}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <button onClick={() => setFilter('')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${!filter ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary'}`}>
            {t('terminal.all')} ({claudeProcesses.length})
          </button>
          {types.map(tp => {
            const count = claudeProcesses.filter(p => p.type === tp).length;
            if (count === 0) return null;
            return (
              <button key={tp} onClick={() => setFilter(tp)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filter === tp ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary'}`}>
                {tp} ({count})
              </button>
            );
          })}
        </div>

        {/* Process list */}
        <div className="space-y-0.5">
          {loading && filtered.length === 0 && <p className="text-text-tertiary text-sm italic py-4 animate-pulse">{t('common.loading')}</p>}
          {!loading && filtered.length === 0 && <p className="text-text-tertiary text-sm italic py-4">{t('terminal.noProcesses')}</p>}
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                selectedId === p.id ? 'bg-accent/[.08] ring-1 ring-accent/30' : 'bg-card hover:bg-card-hover'
              }`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[p.status] ?? 'bg-text-tertiary'}`} />
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-card-hover text-text-secondary truncate max-w-20">{p.type}</span>
              <span className="text-text flex-1 truncate text-xs">{p.description ?? p.taskId ?? '—'}</span>
              {p.status === 'queued' && <span className="text-xs text-accent/60 italic">{t('terminal.statusQueued').toLowerCase()}</span>}
              <span className="text-text-tertiary text-xs shrink-0">
                {new Date(p.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              {p.endedAt && (
                <span className="text-text-tertiary text-xs shrink-0">
                  {Math.round((new Date(p.endedAt).getTime() - new Date(p.startedAt).getTime()) / 1000)}s
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — output */}
      {selected && (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot[selected.status] ?? 'bg-text-tertiary'}`} />
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-card-hover text-text-secondary">{selected.type}</span>
              <span className="text-sm text-text truncate">{selected.description ?? selected.taskId ?? '—'}</span>
              <span className="text-xs text-text-tertiary">{t(statusLabelKey[selected.status] ?? selected.status)}</span>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-text-tertiary hover:text-text text-xs">{t('common.close')}</button>
          </div>
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
