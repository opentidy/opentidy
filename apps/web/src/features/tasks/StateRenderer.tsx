// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useTranslation } from 'react-i18next';
import type { Task } from '@opentidy/shared';
import { getArtifactUrl } from '../../shared/api';

function MarkdownContent({ raw }: { raw: string }) {
  const lines = raw.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();

        // H1
        if (trimmed.startsWith('# ')) return <h2 key={i} className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a] mt-4 mb-1">{trimmed.slice(2)}</h2>;
        // H2
        if (trimmed.startsWith('## ')) return <h3 key={i} className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a] mt-4 mb-1">{trimmed.slice(3)}</h3>;
        // H3
        if (trimmed.startsWith('### ')) return <h4 key={i} className="text-xs font-semibold text-text-secondary mt-3 mb-1">{trimmed.slice(4)}</h4>;
        // Status/mode metadata lines (both EN and FR)
        if (trimmed.startsWith('STATUT') || trimmed.startsWith('STATUS') || trimmed.startsWith('MODE')) return null;
        // List item
        if (trimmed.startsWith('- ')) {
          const indent = line.length - trimmed.length;
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed" style={{ paddingLeft: `${indent * 4}px` }}>
              <span className="text-text-tertiary mt-1.5 shrink-0">·</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }
        // Empty line
        if (!trimmed) return <div key={i} className="h-2" />;
        // Normal text
        return <p key={i} className="text-xs text-text-secondary leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function StateRenderer({ task }: { task: Task }) {
  const { t } = useTranslation();

  // If we have raw state.md content, render it directly
  if (task.stateRaw) {
    return (
      <div className="space-y-6">
        <MarkdownContent raw={task.stateRaw} />

        {task.artifacts.length > 0 && (
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('common.files')}</h3>
            <ul className="space-y-1">
              {task.artifacts.map((artifact) => (
                <li key={artifact} className="flex items-center gap-2 text-xs text-text-secondary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                  <a
                    href={getArtifactUrl(task.id, artifact)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent text-[13px] hover:underline"
                  >
                    {artifact}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Fallback: structured rendering
  const isTermine = task.status === 'COMPLETED';
  const lastEntry = task.journal?.[task.journal.length - 1];

  return (
    <div className="space-y-6">
      {lastEntry && task.journal.length > 1 && (
        <div className={`rounded-xl p-3.5 ${isTermine ? 'bg-green/10 border border-green/20' : 'bg-accent/10 border border-accent/20'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isTermine ? 'text-green' : 'text-accent'}`}>
              {isTermine ? t('stateRenderer.completed') : t('stateRenderer.lastAction')}
            </span>
            <span className="text-xs text-text-tertiary">{lastEntry.date}</span>
          </div>
          <p className={`text-sm ${isTermine ? 'text-green' : 'text-text'}`}>{lastEntry.text}</p>
        </div>
      )}

      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('stateRenderer.objective')}</h3>
        <p className="text-xs text-text-secondary leading-relaxed">{task.objective}</p>
      </div>

      {task.journal && task.journal.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('stateRenderer.log')}</h3>
          <div className="space-y-2">
            {task.journal.slice().reverse().map((entry, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <span className="text-[#48484a] text-xs w-20 shrink-0 pt-0.5">{entry.date}</span>
                <span className="text-text-secondary">{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {task.artifacts.length > 0 && (
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a] mb-2">{t('common.files')}</h3>
          <ul className="space-y-1">
            {task.artifacts.map((artifact) => (
              <li key={artifact} className="flex items-center gap-2 text-xs text-text-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
                <a
                  href={getArtifactUrl(task.id, artifact)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent text-[13px] hover:underline"
                >
                  {artifact}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}