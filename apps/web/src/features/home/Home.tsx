// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import { formatDuration } from '../../shared/utils/format';
import { urgencyStyles } from '../../shared/utils/status-colors';
import type { Task, Session, Suggestion } from '@opentidy/shared';

export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    tasks, sessions, suggestions,
    fetchTasks, fetchSuggestions, fetchSessions,
    approveSuggestion, ignoreSuggestion,
    setWaitingType,
  } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchSuggestions(), fetchSessions()])
      .finally(() => setLoading(false));
  }, [fetchTasks, fetchSuggestions, fetchSessions]);

  const tasksById = new Map(tasks.map(d => [d.id, d]));
  const idleSessions = sessions.filter((s) => s.status === 'idle');

  const getWaitingType = (s: Session): 'user' | 'tiers' => {
    if (s.waitingType) return s.waitingType;
    const task = tasksById.get(s.taskId);
    if (task?.waitingType) return task.waitingType;
    return 'user';
  };

  const waitingUser = idleSessions.filter((s) => getWaitingType(s) === 'user');
  const waitingTiers = idleSessions.filter((s) => getWaitingType(s) === 'tiers');

  const runningTasks = tasks
    .filter((d) => {
      if (d.status !== 'IN_PROGRESS' && !d.hasActiveSession) return false;
      // Exclude tasks that are idle (waiting for user or tiers)
      const session = sessions.find((s) => s.taskId === d.id);
      if (session?.status === 'idle') return false;
      return true;
    })
    .sort((a, b) => (b.lastAction ?? '').localeCompare(a.lastAction ?? ''));

  const totalItems = suggestions.length + waitingUser.length + runningTasks.length + waitingTiers.length;
  const isEmpty = totalItems === 0 && !loading;
  // Center content vertically when there's little to show
  const isLight = totalItems <= 6;

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-secondary text-sm animate-pulse">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Empty state: nothing happening
  if (isEmpty) {
    const completedCount = tasks.filter((d) => d.status === 'COMPLETED').length;
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <BreathingDot color="green" size="lg" />
          <h2 className="text-lg font-semibold text-text mt-6 mb-1.5">{t('home.allClear')}</h2>
          <p className="text-xs text-text-tertiary mb-8">{t('home.nothingNeeded')}</p>
          <button
            onClick={() => navigate('/nouveau')}
            className="bg-accent text-white font-semibold rounded-lg px-5 py-2.5 text-sm shadow-[0_2px_8px_rgba(10,132,255,0.2)] hover:bg-accent/90 transition-colors"
          >
            {t('home.newTask')}
          </button>
          {completedCount > 0 && (
            <p className="text-[12px] text-[#2c2c2e] mt-6">
              {t('home.completedCount', { count: completedCount })}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Build hero summary
  const hasNeedsYou = waitingUser.length > 0;
  const heroColor = hasNeedsYou ? 'orange' as const : 'green' as const;
  const heroParts: string[] = [];
  if (waitingUser.length > 0) heroParts.push(t('home.needsYouCount', { count: waitingUser.length }));
  if (runningTasks.length > 0) heroParts.push(t('home.tasksRunning', { count: runningTasks.length }));
  if (waitingTiers.length > 0) heroParts.push(t('home.waitingCount', { count: waitingTiers.length }));
  const heroSummary = heroParts.join(' · ');

  const content = (
    <div className="w-full max-w-2xl mx-auto">
      {suggestions.length > 0 && (
        <SuggestionsSection
          suggestions={suggestions}
          onApprove={approveSuggestion}
          onDismiss={ignoreSuggestion}
        />
      )}

      {waitingUser.length > 0 && (
        <NeedsYouSection sessions={waitingUser} tasksById={tasksById} />
      )}

      {runningTasks.length > 0 && (
        <section className="mb-5">
          <SectionLabel color="text-green" dotColor="bg-green" label={t('home.running')} />
          <div className="space-y-1.5">
            {runningTasks.map((task) => (
              <RunningTaskCard key={task.id} task={task} session={sessions.find((s) => s.taskId === task.id)} />
            ))}
          </div>
        </section>
      )}

      {waitingTiers.length > 0 && (
        <WaitingSection sessions={waitingTiers} tasksById={tasksById} setWaitingType={setWaitingType} />
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className={`flex-1 overflow-y-auto px-5 md:px-6 pb-8 ${isLight ? 'flex flex-col items-center justify-center' : ''}`}>
        {isLight && (
          <div className="flex flex-col items-center mb-6">
            <BreathingDot color={heroColor} />
            <p className="text-sm font-medium text-text mt-4">{heroSummary}</p>
            {!hasNeedsYou && (
              <p className="text-xs text-text-tertiary mt-1">{t('home.onTrack')}</p>
            )}
          </div>
        )}
        {content}
      </div>
    </div>
  );
}

// --- Header ---

function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between px-5 md:px-6 py-4 shrink-0">
      <h1 className="text-base font-bold text-text">Home</h1>
      <button
        onClick={() => navigate('/nouveau')}
        className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(10,132,255,0.2)] hover:bg-accent/90 transition-colors"
      >
        {t('home.newTask')}
      </button>
    </div>
  );
}

// --- Breathing dot ---

function BreathingDot({ color, size }: { color: 'green' | 'orange'; size?: 'lg' }) {
  const outerSize = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const innerSize = size === 'lg' ? 'w-3 h-3' : 'w-2.5 h-2.5';
  const bg = color === 'green'
    ? 'bg-[radial-gradient(circle,rgba(48,209,88,0.15),transparent)]'
    : 'bg-[radial-gradient(circle,rgba(255,159,10,0.15),transparent)]';
  const dotBg = color === 'green' ? 'bg-green' : 'bg-orange';
  const shadow = color === 'green'
    ? 'shadow-[0_0_20px_rgba(48,209,88,0.3)]'
    : 'shadow-[0_0_20px_rgba(255,159,10,0.3)]';

  return (
    <div className={`${outerSize} rounded-full ${bg} flex items-center justify-center animate-[float_4s_ease-in-out_infinite]`}>
      <div className={`${innerSize} rounded-full ${dotBg} ${shadow}`} />
    </div>
  );
}

// --- Section label ---

function SectionLabel({ color, dotColor, label }: { color: string; dotColor: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className={`text-[12px] font-semibold uppercase tracking-wider ${color}`}>{label}</span>
    </div>
  );
}

// --- Suggestions ---

const sourceEmoji: Record<string, string> = {
  email: '📧', sms: '💬', whatsapp: '💬', telegram: '📱', checkup: '🔍', app: '📋',
};

function SuggestionsSection({
  suggestions, onApprove, onDismiss,
}: {
  suggestions: Suggestion[];
  onApprove: (slug: string, instruction?: string) => Promise<void>;
  onDismiss: (slug: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <section className="mb-5">
      <SectionLabel color="text-[#a78bfa]" dotColor="bg-[#a78bfa]" label={t('home.suggestsLabel')} />
      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <SuggestionRow key={s.slug} suggestion={s} onApprove={onApprove} onDismiss={onDismiss} />
        ))}
      </div>
    </section>
  );
}

function SuggestionRow({
  suggestion: s, onApprove, onDismiss,
}: {
  suggestion: Suggestion;
  onApprove: (slug: string, instruction?: string) => Promise<void>;
  onDismiss: (slug: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const style = urgencyStyles[s.urgency] ?? urgencyStyles.normal;

  return (
    <div className={`bg-[rgba(167,139,250,0.04)] border border-dashed ${style.border} rounded-[10px] transition-colors`}>
      {/* Collapsed header, click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-2.5 md:p-3 flex items-center gap-3"
      >
        <div className="w-9 h-9 bg-[rgba(167,139,250,0.08)] rounded-[10px] flex items-center justify-center shrink-0 text-base">
          {sourceEmoji[s.source] ?? '💡'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-[7px] h-[7px] rounded-full ${style.dot} shrink-0`} />
            <span className={`text-[13px] font-medium ${style.title} truncate`}>{s.title}</span>
          </div>
          {!expanded && s.summary && (
            <div className="text-[12px] text-text-tertiary mt-0.5 ml-[15px] truncate">{s.summary}</div>
          )}
        </div>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onDismiss(s.slug); }}
          className="text-[12px] text-text-tertiary hover:text-text-secondary shrink-0 px-1.5 py-0.5 rounded hover:bg-card-hover transition-colors"
        >
          {t('suggestion.ignore')}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-text-tertiary shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-3">
          {/* Summary, only if different from why */}
          {s.summary && s.summary !== s.why && (
            <p className="text-[13px] text-text-secondary">{s.summary}</p>
          )}

          {/* Why */}
          {s.why && (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{t('suggestion.why')}</span>
              <p className="text-[13px] text-text-secondary mt-0.5">{s.why}</p>
            </div>
          )}

          {/* What I would do */}
          {s.whatIWouldDo && (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{t('suggestion.whatIWouldDo')}</span>
              <p className="text-[13px] text-text-secondary mt-0.5">{s.whatIWouldDo}</p>
            </div>
          )}

          {/* Context (original message) */}
          {s.context && (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{t('suggestion.viewOriginal')}</span>
              <pre className="mt-1 p-2.5 bg-[#161618] rounded-lg text-[12px] text-text-secondary whitespace-pre-wrap font-mono border border-border-subtle">
                {s.context}
              </pre>
            </div>
          )}

          {/* Instruction textarea */}
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t('suggestion.instructionPlaceholder')}
            rows={2}
            className="w-full text-[13px] bg-[#161618] border border-border-subtle rounded-lg p-2.5 text-text placeholder:text-text-tertiary resize-none focus:outline-none focus:border-[#a78bfa]/50"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(s.slug, instruction.trim() || undefined)}
              className="flex-1 py-2 text-[13px] font-semibold text-white bg-[#a78bfa] rounded-lg hover:bg-[#9678f0] transition-colors"
            >
              {t('suggestion.createTask')}
            </button>
            <button
              onClick={() => onDismiss(s.slug)}
              className="py-2 px-4 text-[13px] text-text-tertiary rounded-lg border border-border-subtle hover:bg-card-hover transition-colors"
            >
              {t('suggestion.ignore')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Needs you ---

function NeedsYouSection({
  sessions: waitingSessions, tasksById,
}: {
  sessions: Session[];
  tasksById: Map<string, Task>;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="mb-5">
      <SectionLabel color="text-orange" dotColor="bg-orange" label={t('home.needsYou')} />
      <div className="space-y-1.5">
        {waitingSessions.map((s) => {
          const task = tasksById.get(s.taskId);
          const waitingMessage = task?.waitingFor
            ?.replace(/ATTENTE\s*:\s*(USER|TIERS)\n?/i, '')
            .trim();

          return (
            <button
              key={s.id}
              onClick={() => navigate(`/task/${s.taskId}`)}
              className="w-full text-left bg-card rounded-[10px] p-2.5 md:p-3 flex items-center gap-2.5 hover:bg-card-hover transition-colors cursor-pointer"
            >
              <span className="w-[7px] h-[7px] rounded-full bg-orange shadow-[0_0_6px_rgba(255,159,10,0.4)] animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text truncate">{task?.title ?? s.taskId}</div>
                {waitingMessage && (
                  <div className="text-[13px] text-text-secondary mt-0.5 truncate">"{waitingMessage}"</div>
                )}
              </div>
              <span className="text-[13px] text-text-tertiary shrink-0">
                {s.startedAt ? formatDuration(s.startedAt) : ''}
              </span>
              <span className="text-[13px] text-orange font-medium shrink-0">Open →</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// --- Running task card ---

function RunningTaskCard({ task, session }: { task: Task; session?: Session }) {
  const navigate = useNavigate();
  const lastJournal = task.journal?.[task.journal.length - 1];

  return (
    <button
      onClick={() => navigate(`/task/${task.id}`)}
      className="w-full text-left bg-card rounded-[10px] p-2.5 md:p-3 flex items-center gap-2.5 hover:bg-card-hover transition-colors cursor-pointer"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text truncate">{task.title}</div>
        <div className="text-[13px] text-text-tertiary mt-0.5 truncate">
          {lastJournal?.text || task.objective}
        </div>
      </div>
      {session?.status === 'active' && (
        <span className="flex items-center gap-1 text-[13px] text-green shrink-0">
          <span className="w-1 h-1 rounded-full bg-green animate-pulse" />
          Terminal
        </span>
      )}
      <span className="text-[13px] text-text-tertiary shrink-0">
        {session?.startedAt ? formatDuration(session.startedAt) : task.lastAction}
      </span>
    </button>
  );
}

// --- Waiting for response ---

function WaitingSection({
  sessions: waitingSessions, tasksById, setWaitingType,
}: {
  sessions: Session[];
  tasksById: Map<string, Task>;
  setWaitingType: (id: string, type: 'user' | 'tiers') => Promise<void>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="mb-5">
      <SectionLabel color="text-accent" dotColor="bg-accent" label={t('home.waitingForResponse')} />
      <div className="space-y-1.5">
        {waitingSessions.map((s) => {
          const task = tasksById.get(s.taskId);
          const waitingMessage = task?.waitingFor
            ?.replace(/ATTENTE\s*:\s*(USER|TIERS)\n?/i, '')
            .trim();

          return (
            <div
              key={s.id}
              className="bg-card rounded-[10px] p-2.5 md:p-3 flex items-center gap-2.5 cursor-pointer hover:bg-card-hover transition-colors"
              onClick={() => navigate(`/task/${s.taskId}`)}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text truncate">{task?.title ?? s.taskId}</div>
                {waitingMessage && (
                  <div className="text-[13px] text-text-tertiary mt-0.5 truncate">{waitingMessage}</div>
                )}
              </div>
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setWaitingType(s.taskId, 'user'); }}
                className="text-[13px] text-text-tertiary hover:text-orange shrink-0 px-1.5 py-0.5 rounded hover:bg-orange/10 transition-colors"
              >
                ← {t('home.userWait')}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
