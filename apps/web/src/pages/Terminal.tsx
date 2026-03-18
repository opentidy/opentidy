import { useEffect, useRef, useState } from 'react';
import { useStore, useProcessOutput } from '../store';
import { SessionOutput } from '../components/SessionOutput';
import * as api from '../api';
import type { ClaudeProcessType } from '@opentidy/shared';

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
    } catch {}
  }
  return events;
}

/** Render plain-text output (non-JSONL processes: triage, checkup, memory).
 *  Extracts human-readable info from embedded JSON when present. */
function PlainTextOutput({ raw }: { raw: string }) {
  // Separate prose from JSON blocks
  const prose = raw
    .replace(/```(?:json)?\s*[\s\S]*?```/g, '')
    .replace(/^\s*[\[{][\s\S]*?[\]}]\s*$/gm, '')
    .trim();

  // Try to extract useful fields from any JSON in the output
  const jsonBlocks: Record<string, unknown>[] = [];
  // Match ```json ... ``` blocks
  for (const m of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    try { jsonBlocks.push(JSON.parse(m[1])); } catch {}
  }
  // Match bare JSON objects
  if (jsonBlocks.length === 0) {
    for (const m of raw.matchAll(/(\{[\s\S]*?\})/g)) {
      try { jsonBlocks.push(JSON.parse(m[1])); } catch {}
    }
  }

  // Extract human-readable fields from JSON
  const infos: { label: string; value: string }[] = [];
  for (const obj of jsonBlocks) {
    // Triage response
    if ('ignore' in obj && obj.ignore) infos.push({ label: 'Verdict', value: 'Ignoré' });
    if ('reason' in obj && typeof obj.reason === 'string') infos.push({ label: 'Raison', value: obj.reason });
    if ('dossierIds' in obj && Array.isArray(obj.dossierIds) && obj.dossierIds.length > 0)
      infos.push({ label: 'Dossiers', value: (obj.dossierIds as string[]).join(', ') });
    // Checkup response
    if ('launch' in obj && Array.isArray(obj.launch))
      infos.push({ label: 'Sessions lancées', value: obj.launch.length > 0 ? (obj.launch as string[]).join(', ') : 'aucune' });
    if ('suggestions' in obj && Array.isArray(obj.suggestions))
      infos.push({ label: 'Suggestions', value: obj.suggestions.length > 0 ? (obj.suggestions as { title: string }[]).map(s => s.title).join(', ') : 'aucune' });
  }

  if (!prose && infos.length === 0) return <p className="text-text-tertiary italic">Aucune sortie</p>;

  return (
    <div className="space-y-3">
      {prose && <div className="text-text whitespace-pre-wrap">{prose}</div>}
      {infos.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {infos.map((info, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-text-tertiary shrink-0 w-28">{info.label}</span>
              <span className="text-text-secondary">{info.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProcessOutput({ processId, status, exitCode, startedAt, endedAt }: {
  processId: number; status: string; exitCode?: number; startedAt: string; endedAt?: string;
}) {
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
          {status === 'done' && `Terminé en ${duration ?? '?'}s (exit code: ${exitCode ?? '?'})`}
          {status === 'error' && `Erreur${duration ? ` après ${duration}s` : ''}`}
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
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {loading && <p className="text-text-tertiary italic">Chargement...</p>}
        {!loading && output === null && <p className="text-text-tertiary italic">Pas de logs disponibles</p>}
        {!loading && output !== null && viewMode === 'raw' && (
          <div className="space-y-1">
            {output.split('\n').filter(l => l.trim()).map((line, i) => {
              try { return <pre key={i} className="text-text whitespace-pre-wrap break-all bg-surface rounded p-2 mb-1">{JSON.stringify(JSON.parse(line), null, 2)}</pre>; }
              catch { return <pre key={i} className="text-text whitespace-pre-wrap">{line}</pre>; }
            })}
          </div>
        )}
        {!loading && output !== null && viewMode === 'simple' && (
          <div className="space-y-2">
            {parsed.length === 0 && output.trim() && (
              <PlainTextOutput raw={output.trim()} />
            )}
            {parsed.length === 0 && !output.trim() && <p className="text-text-tertiary italic">Aucune sortie</p>}
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

function LiveProcessOutput({ trackId, processType }: { trackId: number; processType?: string }) {
  const output = useProcessOutput(trackId);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [output]);

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs">
      {!output && processType && (
        <div className="text-text-tertiary italic">
          <p className="animate-pulse mb-2">En cours...</p>
          <p className="text-xs">Les processus {processType} affichent leur sortie à la fin de l'exécution.</p>
        </div>
      )}
      {!output && !processType && <p className="text-text-tertiary italic animate-pulse">En attente...</p>}
      <pre className="text-text whitespace-pre-wrap">{output}</pre>
      <div ref={bottomRef} />
    </div>
  );
}

const statusDot: Record<string, string> = {
  queued: 'bg-accent/50',
  running: 'bg-green animate-pulse',
  done: 'bg-text-tertiary',
  error: 'bg-red',
};

const statusLabel: Record<string, string> = {
  queued: 'En attente',
  running: 'En cours',
  done: 'Terminé',
  error: 'Erreur',
};

export default function Terminal() {
  const { claudeProcesses, fetchClaudeProcesses } = useStore();
  const [filter, setFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(claudeProcesses.length === 0);

  useEffect(() => {
    fetchClaudeProcesses().finally(() => setLoading(false));
    const interval = setInterval(fetchClaudeProcesses, 5_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = filter ? claudeProcesses.filter(p => p.type === filter) : claudeProcesses;
  const selected = claudeProcesses.find(p => p.id === selectedId);

  const types: ClaudeProcessType[] = ['triage', 'checkup', 'title', 'memory-injection', 'memory-extraction', 'memory-prompt'];

  const queuedCount = claudeProcesses.filter(p => p.status === 'queued').length;
  const runningCount = claudeProcesses.filter(p => p.status === 'running').length;
  const doneCount = claudeProcesses.filter(p => p.status === 'done').length;

  return (
    <div className="flex h-full">
      {/* Left panel — process list */}
      <div className={`${selected ? 'w-1/3 border-r border-border' : 'w-full max-w-2xl mx-auto'} p-4 overflow-y-auto transition-all`}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-text">Processus Claude</h1>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {runningCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />{runningCount} actifs</span>}
            {queuedCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent/50" />{queuedCount} en attente</span>}
            {doneCount > 0 && <span>{doneCount} terminés</span>}
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <button onClick={() => setFilter('')}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${!filter ? 'bg-accent text-white' : 'bg-surface-hover text-text-secondary'}`}>
            Tous ({claudeProcesses.length})
          </button>
          {types.map(t => {
            const count = claudeProcesses.filter(p => p.type === t).length;
            if (count === 0) return null;
            return (
              <button key={t} onClick={() => setFilter(t)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${filter === t ? 'bg-accent text-white' : 'bg-surface-hover text-text-secondary'}`}>
                {t} ({count})
              </button>
            );
          })}
        </div>

        {/* Process list */}
        <div className="space-y-0.5">
          {loading && filtered.length === 0 && <p className="text-text-tertiary text-sm italic py-4 animate-pulse">Chargement...</p>}
          {!loading && filtered.length === 0 && <p className="text-text-tertiary text-sm italic py-4">Aucun processus</p>}
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                selectedId === p.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'bg-surface hover:bg-surface-hover'
              }`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[p.status] ?? 'bg-text-tertiary'}`} />
              <span className="font-mono text-xs px-1 py-0.5 rounded bg-surface-hover text-text-secondary truncate max-w-20">{p.type}</span>
              <span className="text-text flex-1 truncate text-xs">{p.description ?? p.dossierId ?? '—'}</span>
              {p.status === 'queued' && <span className="text-xs text-accent/60 italic">en attente</span>}
              <span className="text-text-tertiary text-xs shrink-0">
                {new Date(p.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-hover text-text-secondary">{selected.type}</span>
              <span className="text-sm text-text truncate">{selected.description ?? selected.dossierId ?? '—'}</span>
              <span className="text-xs text-text-tertiary">{statusLabel[selected.status] ?? selected.status}</span>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-text-tertiary hover:text-text text-xs">Fermer</button>
          </div>
          <div className="flex-1 min-h-0">
            {selected.status === 'queued' && (
              <div className="flex items-center justify-center h-full text-text-tertiary">
                <div className="text-center">
                  <div className="w-4 h-4 rounded-full bg-accent/30 animate-pulse mx-auto mb-2" />
                  <p className="text-sm">En attente d'un slot (max 3 simultanés)</p>
                </div>
              </div>
            )}
            {selected.status === 'running' && selected.dossierId && (
              <SessionOutput dossierId={selected.dossierId} />
            )}
            {selected.status === 'running' && !selected.dossierId && (
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
