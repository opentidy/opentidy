// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import SuggestionCard from '../../shared/SuggestionCard';
import DossierCard from '../dossiers/DossierCard';
import WelcomeCard from './WelcomeCard';
import HelpTooltip from '../../shared/HelpTooltip';
type Filter = 'active' | 'completed';


export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { dossiers, suggestions, sessions, fetchDossiers, fetchSuggestions, fetchSessions, setWaitingType } = useStore();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [onboardingSeen, setOnboardingSeen] = useState(
    () => localStorage.getItem('opentidy-onboarding-seen') === 'true'
  );

  useEffect(() => {
    Promise.all([fetchDossiers(), fetchSuggestions(), fetchSessions()])
      .finally(() => setLoading(false));
  }, [fetchDossiers, fetchSuggestions, fetchSessions]);

  const showWelcome = !onboardingSeen && dossiers.length === 0 && !loading;

  function dismissOnboarding() {
    localStorage.setItem('opentidy-onboarding-seen', 'true');
    setOnboardingSeen(true);
  }

  const dossiersById = new Map(dossiers.map(d => [d.id, d]));
  const idleSessions = sessions.filter((s) => s.status === 'idle');

  // Determine effective waitingType: session > dossier > default 'user'
  const getWaitingType = (s: typeof sessions[0]): 'user' | 'tiers' => {
    if (s.waitingType) return s.waitingType;
    const dossier = dossiersById.get(s.dossierId);
    if (dossier?.waitingType) return dossier.waitingType;
    return 'user';
  };

  const waitingUser = idleSessions.filter((s) => getWaitingType(s) === 'user');
  const waitingTiers = idleSessions.filter((s) => getWaitingType(s) === 'tiers');

  const counts = {
    active: dossiers.filter((d) => d.status === 'IN_PROGRESS' || d.hasActiveSession).length,
    completed: dossiers.filter((d) => d.status === 'COMPLETED').length,
  };

  const filtered = dossiers
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
      <div className="p-6 md:p-8">
        <Header />
        <p className="text-text-tertiary text-sm py-20 text-center animate-pulse">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <Header />

      {showWelcome && <WelcomeCard onDismiss={dismissOnboarding} />}

      {/* En attente de toi — sessions idle waiting for user */}
      {waitingUser.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-orange animate-pulse" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {t('home.waitingForYou')} — {t('home.dossier', { count: waitingUser.length })}
            </span>
          </div>
          <div className="space-y-3">
            {waitingUser.map((s) => {
              const dossier = dossiersById.get(s.dossierId);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/dossier/${s.dossierId}`)}
                  className="w-full text-left bg-card border border-orange/30 rounded-xl p-4 hover:border-orange/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange/10 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                        <polyline points="4,17 10,11 4,5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text truncate">{dossier?.title ?? s.dossierId}</p>
                      <p className="text-xs text-text-tertiary mt-0.5">{t('home.claudeWaiting')}</p>
                    </div>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setWaitingType(s.dossierId, 'tiers'); }}
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
            <span className="w-2.5 h-2.5 rounded-full bg-orange/30" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
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
            <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {t('home.waitingForResponse')} — {t('home.dossier', { count: waitingTiers.length })}
            </span>
          </div>
          <div className="space-y-2">
            {waitingTiers.map((s) => {
              const dossier = dossiersById.get(s.dossierId);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/dossier/${s.dossierId}`)}
                  className="w-full text-left bg-card border border-accent/20 rounded-xl p-3 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent/60">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12,6 12,12 16,14" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text text-sm truncate">{dossier?.title ?? s.dossierId}</p>
                      {dossier?.waitingFor && (
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">{dossier.waitingFor.replace(/ATTENTE\s*:\s*(USER|TIERS)\n?/i, '').trim()}</p>
                      )}
                    </div>
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setWaitingType(s.dossierId, 'user'); }}
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
            <span className="w-2.5 h-2.5 rounded-full bg-accent/30" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {t('home.waitingForResponse')}
            </span>
          </div>
          <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptyWaitingTiers')}</p>
        </section>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rotate-45 bg-accent" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {t('home.suggestions')} — {t('home.new', { count: suggestions.length })}
            </span>
          </div>
          <div className="space-y-3">
            {suggestions.map((s) => <SuggestionCard key={s.slug} suggestion={s} />)}
          </div>
        </section>
      )}
      {suggestions.length === 0 && !showWelcome && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rotate-45 bg-accent/30" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {t('home.suggestions')}
            </span>
            <HelpTooltip text={t('helpTooltip.suggestion')} />
          </div>
          <p className="text-text-tertiary text-xs pl-5">{t('onboarding.emptySuggestions')}</p>
        </section>
      )}

      {/* Dossiers list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">{t('home.dossiers')}</span>
            <div className="flex gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    filter === f.key
                      ? 'bg-text/10 border-text/20 text-text'
                      : 'border-border text-text-tertiary hover:text-text-secondary'
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
              className="hidden md:block bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary outline-none focus:border-accent w-40"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((d) => <DossierCard key={d.id} dossier={d} session={sessions.find((s) => s.dossierId === d.id)} />)}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-8">
              <p className="text-text-tertiary text-sm mb-3">
                {filter === 'active' ? t('onboarding.emptyDossiers') : t('home.noDossiers', { filter: t('home.completed').toLowerCase() })}
              </p>
              {filter === 'active' && (
                <button
                  onClick={() => navigate('/nouveau')}
                  className="px-4 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors"
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
        <span className={`text-xs hidden md:inline ${checkupRunning ? 'text-accent animate-pulse' : 'text-text-tertiary'}`}>
          {checkupLabel}
        </span>
        <button
          onClick={handleCheckup}
          disabled={checkupRunning}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hidden md:block ${
            checkupRunning ? 'bg-accent/20 text-accent cursor-wait' : 'bg-surface-hover text-text-secondary hover:bg-surface-active'
          }`}
        >
          {checkupRunning ? 'Checkup...' : t('home.runCheckup')}
        </button>
        <button
          onClick={() => navigate('/nouveau')}
          className="px-3 py-1.5 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 transition-colors hidden md:block"
        >
          {t('home.newDossier')}
        </button>
      </div>
    </div>
  );
}
