// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import TaskCard from '../tasks/TaskCard';
import WelcomeCard from './WelcomeCard';
import HelpTooltip from '../../shared/HelpTooltip';
type Filter = 'active' | 'completed';


export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tasks, sessions, fetchTasks, fetchSuggestions, fetchSessions, setWaitingType } = useStore();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [onboardingSeen, setOnboardingSeen] = useState(
    () => localStorage.getItem('opentidy-onboarding-seen') === 'true'
  );

  useEffect(() => {
    Promise.all([fetchTasks(), fetchSuggestions(), fetchSessions()])
      .finally(() => setLoading(false));
  }, [fetchTasks, fetchSuggestions, fetchSessions]);

  const showWelcome = !onboardingSeen && tasks.length === 0 && !loading;

  function dismissOnboarding() {
    localStorage.setItem('opentidy-onboarding-seen', 'true');
    setOnboardingSeen(true);
  }

  const tasksById = new Map(tasks.map(d => [d.id, d]));
  const idleSessions = sessions.filter((s) => s.status === 'idle');

  // Determine effective waitingType: session > task > default 'user'
  const getWaitingType = (s: typeof sessions[0]): 'user' | 'tiers' => {
    if (s.waitingType) return s.waitingType;
    const task = tasksById.get(s.taskId);
    if (task?.waitingType) return task.waitingType;
    return 'user';
  };

  const waitingUser = idleSessions.filter((s) => getWaitingType(s) === 'user');
  const waitingTiers = idleSessions.filter((s) => getWaitingType(s) === 'tiers');

  const counts = {
    active: tasks.filter((d) => d.status === 'IN_PROGRESS' || d.hasActiveSession).length,
    completed: tasks.filter((d) => d.status === 'COMPLETED').length,
  };

  const filtered = tasks
    .filter((d) => {
      if (filter === 'active') return d.status === 'IN_PROGRESS' || d.hasActiveSession;
      return d.status === 'COMPLETED';
    })
    .filter((d) => !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.objective.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.lastAction ?? '').localeCompare(a.lastAction ?? ''));

  const filters: { key: Filter; label: string }[] = [
    { key: 'active', label: t('home.active') },
    { key: 'completed', label: t('home.completed') },
  ];

  if (loading) {
    return (
      <div className="p-5 md:p-7">
        <Header />
        <p className="text-text-secondary text-sm py-20 text-center animate-pulse">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-7">
      <Header />

      {showWelcome && <WelcomeCard onDismiss={dismissOnboarding} />}

      {/* En attente de toi — sessions idle waiting for user */}
      {waitingUser.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-[7px] h-[7px] rounded-full bg-orange shadow-[0_0_6px_rgba(255,159,10,0.4)] animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange">
              {t('home.waitingForYou')} — {t('home.task', { count: waitingUser.length })}
            </span>
          </div>
          <div className="space-y-3">
            {waitingUser.map((s) => {
              const task = tasksById.get(s.taskId);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/task/${s.taskId}`)}
                  className="w-full text-left bg-card rounded-xl p-3.5 border-l-[3px] border-orange hover:bg-card-hover transition-colors duration-150 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange/10 rounded-lg flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="4,17 10,11 4,5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text truncate">{task?.title ?? s.taskId}</p>
                      <p className="text-xs text-text-tertiary mt-0.5">{t('home.claudeWaiting')}</p>
                    </div>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setWaitingType(s.taskId, 'tiers'); }}
                      className="text-xs text-text-tertiary hover:text-accent font-medium shrink-0 px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                    >
                      {t('home.thirdPartyWait')}
                    </span>
                    <span className="text-xs text-orange font-medium shrink-0">{t('common.open')}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {waitingUser.length === 0 && !showWelcome && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-[7px] h-[7px] rounded-full bg-orange/30" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange">
              {t('home.waitingForYou')}
            </span>
            <HelpTooltip text={t('helpTooltip.waitingUser')} />
          </div>
          <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptyWaitingUser')}</p>
        </section>
      )}

      {/* En attente de reponse — sessions idle waiting for third party */}
      {waitingTiers.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-[7px] h-[7px] rounded-full bg-accent/60 shadow-[0_0_6px_rgba(10,132,255,0.3)]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              {t('home.waitingForResponse')} — {t('home.task', { count: waitingTiers.length })}
            </span>
          </div>
          <div className="space-y-2">
            {waitingTiers.map((s) => {
              const task = tasksById.get(s.taskId);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/task/${s.taskId}`)}
                  className="w-full text-left bg-card rounded-xl p-3.5 border-l-[3px] border-accent opacity-70 hover:bg-card-hover transition-colors duration-150 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent/60">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12,6 12,12 16,14" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text text-sm truncate">{task?.title ?? s.taskId}</p>
                      {task?.waitingFor && (
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">{task.waitingFor.replace(/ATTENTE\s*:\s*(USER|TIERS)\n?/i, '').trim()}</p>
                      )}
                    </div>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setWaitingType(s.taskId, 'user'); }}
                      className="text-xs text-text-tertiary hover:text-orange font-medium shrink-0 px-2 py-1 rounded hover:bg-orange/10 transition-colors"
                    >
                      {t('home.userWait')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {waitingTiers.length === 0 && !showWelcome && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-[7px] h-[7px] rounded-full bg-accent/30" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              {t('home.waitingForResponse')}
            </span>
          </div>
          <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptyWaitingTiers')}</p>
        </section>
      )}

      {/* Tasks list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a]">{t('home.tasks')}</span>
            <div className="flex gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-md transition-colors ${
                    filter === f.key
                      ? 'bg-card text-text font-medium'
                      : 'text-[#48484a]'
                  }`}
                >
                  {f.label} ({counts[f.key]})
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('home.search')}
              className="hidden md:block bg-card rounded-lg px-2.5 py-1 text-xs text-text placeholder:text-text-tertiary border-none outline-none focus:ring-0 w-40"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((d) => <TaskCard key={d.id} task={d} session={sessions.find((s) => s.taskId === d.id)} />)}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-8">
              <p className="text-text-secondary text-sm mb-3">
                {filter === 'active' ? t('onboarding.emptyTasks') : t('home.noTasks', { filter: t('home.completed').toLowerCase() })}
              </p>
              {filter === 'active' && (
                <button
                  onClick={() => navigate('/nouveau')}
                  className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(10,132,255,0.2)] hover:bg-accent/90 transition-colors"
                >
                  {t('onboarding.emptyCreateCta')}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { checkupStatus, fetchCheckupStatus, triggerCheckup } = useStore();
  const [checkupRunning, setCheckupRunning] = useState(false);

  useEffect(() => { fetchCheckupStatus(); }, [fetchCheckupStatus]);

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  let checkupLabel: string;
  if (checkupRunning) {
    checkupLabel = t('home.checkupRunning');
  } else if (checkupStatus?.lastRun) {
    checkupLabel = t('home.checkupResult', { time: fmt(checkupStatus.lastRun), result: checkupStatus.result === 'ok' ? t('home.checkupOk') : t('home.checkupError') });
    if (checkupStatus.nextRun) checkupLabel += ` · ${t('home.nextAt', { time: fmt(checkupStatus.nextRun) })}`;
  } else if (checkupStatus?.nextRun) {
    checkupLabel = t('home.nextCheckup', { time: fmt(checkupStatus.nextRun) });
  } else {
    checkupLabel = t('home.checkupWaiting');
  }

  const handleCheckup = async () => {
    setCheckupRunning(true);
    try {
      await triggerCheckup();
      await fetchCheckupStatus();
    } finally {
      setCheckupRunning(false);
    }
  };

  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-text">OpenTidy</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-[9px] hidden md:inline ${checkupRunning ? 'text-accent animate-pulse' : 'text-[#48484a]'}`}>
          {checkupLabel}
        </span>
        <button
          onClick={handleCheckup}
          disabled={checkupRunning}
          className={`text-xs transition-colors hidden md:block ${
            checkupRunning ? 'text-accent cursor-wait' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          {checkupRunning ? 'Checkup...' : t('home.runCheckup')}
        </button>
        <button
          onClick={() => navigate('/nouveau')}
          className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(10,132,255,0.2)] hover:bg-accent/90 transition-colors hidden md:block"
        >
          {t('home.newTask')}
        </button>
      </div>
    </div>
  );
}
