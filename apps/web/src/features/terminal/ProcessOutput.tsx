// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../../shared/api';
import PlainTextOutput from './PlainTextOutput';

interface ParsedEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'result';
  content: string;
  detail?: string;
}

function parseJSONL(raw: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'assistant' && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === 'text' && block.text) events.push({ type: 'text', content: block.text });
          if (block.type === 'thinking' && block.thinking) events.push({ type: 'thinking', content: block.thinking });
          if (block.type === 'tool_use') {
            const input = block.input ?? {};
            const summary = input.command ?? input.file_path ?? input.pattern ?? input.query ?? input.url ?? '';
            events.push({ type: 'tool_use', content: block.name, detail: String(summary).slice(0, 200) });
          }
        }
      }
      if (obj.type === 'user' && obj.tool_use_result) {
        const r = obj.tool_use_result;
        const text = r.stdout ?? r.content ?? (typeof r === 'string' ? r : '');
        if (text) events.push({ type: 'tool_result', content: String(text).slice(0, 500) });
      }
      if (obj.type === 'result') {
        events.push({
          type: 'result',
          content: obj.result ?? '',
          detail: `${obj.num_turns} turns · ${Math.round((obj.duration_ms ?? 0) / 1000)}s · $${(obj.total_cost_usd ?? 0).toFixed(4)}`,
        });
      }
    } catch { /* parse error expected */ }
  }
  return events;
}

interface ProcessOutputProps {
  processId: number;
  status: string;
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
}

export default function ProcessOutput({ processId, status, exitCode, startedAt, endedAt }: ProcessOutputProps) {
  const { t } = useTranslation();
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'simple' | 'raw'>('simple');

  useEffect(() => {
    setLoading(true);
    api.fetchProcessOutput(processId)
      .then(text => setOutput(text))
      .catch(() => setOutput(null))
      .finally(() => setLoading(false));
  }, [processId]);

  const duration = endedAt ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000) : null;
  const parsed = output ? parseJSONL(output) : [];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border">
        <span className="text-xs text-text-tertiary">
          {status === 'done' && t('terminal.completedIn', { duration: duration ?? '?', exitCode: exitCode ?? '?' })}
          {status === 'error' && (t('terminal.error') + (duration ? ` ${t('terminal.after', { duration })}` : ''))}
        </span>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('simple')}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'simple' ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary'}`}>
            Simple
          </button>
          <button onClick={() => setViewMode('raw')}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${viewMode === 'raw' ? 'bg-accent text-white' : 'text-text-tertiary hover:text-text-secondary'}`}>
            Raw
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#0f0f11] rounded-lg p-3 font-mono text-xs text-text-secondary">
        {loading && <p className="text-text-tertiary italic">{t('common.loading')}</p>}
        {!loading && output === null && <p className="text-text-tertiary italic">{t('terminal.noLogs')}</p>}
        {!loading && output !== null && viewMode === 'raw' && (
          <div className="space-y-1">
            {output.split('\n').filter(l => l.trim()).map((line, i) => {
              try { return <pre key={i} className="text-text whitespace-pre-wrap break-all bg-card rounded p-2 mb-1">{JSON.stringify(JSON.parse(line), null, 2)}</pre>; }
              catch { return <pre key={i} className="text-text whitespace-pre-wrap">{line}</pre>; }
            })}
          </div>
        )}
        {!loading && output !== null && viewMode === 'simple' && (
          <div className="space-y-2">
            {parsed.length === 0 && output.trim() && (
              <PlainTextOutput raw={output.trim()} />
            )}
            {parsed.length === 0 && !output.trim() && <p className="text-text-tertiary italic">{t('terminal.noOutput')}</p>}
            {parsed.map((ev, i) => {
              if (ev.type === 'thinking') return (
                <details key={i} className="group">
                  <summary className="text-text-tertiary cursor-pointer hover:text-text-secondary text-xs">Thinking ({ev.content.length} chars)</summary>
                  <pre className="mt-1 text-text-tertiary whitespace-pre-wrap text-xs pl-3 border-l-2 border-border">{ev.content}</pre>
                </details>
              );
              if (ev.type === 'tool_use') return (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-accent shrink-0">▶</span>
                  <span className="text-accent font-semibold">{ev.content}</span>
                  {ev.detail && <span className="text-text-tertiary truncate">{ev.detail}</span>}
                </div>
              );
              if (ev.type === 'tool_result') return <pre key={i} className="text-text-secondary whitespace-pre-wrap pl-4 border-l-2 border-border text-xs">{ev.content}</pre>;
              if (ev.type === 'text') return <div key={i} className="text-text whitespace-pre-wrap">{ev.content}</div>;
              if (ev.type === 'result') return (
                <div key={i} className="mt-2 pt-2 border-t border-border">
                  <div className="text-green text-xs mb-1">{ev.detail}</div>
                  <div className="text-text whitespace-pre-wrap">{ev.content}</div>
                </div>
              );
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
