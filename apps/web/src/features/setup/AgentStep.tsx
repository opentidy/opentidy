// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TerminalDrawer } from '../../shared/TerminalDrawer';

interface AgentInfo {
  name: string;
  label: string;
  badge: 'stable' | 'experimental' | 'coming-soon';
  installed: boolean;
  authed: boolean;
  onboarded: boolean;
}

interface AgentStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function AgentStep({ onNext, onBack }: AgentStepProps) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<{ agent: string; command: string } | null>(null);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/setup/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
        setError(null);
        return data as AgentInfo[];
      }
      setError(`HTTP ${res.status}`);
    } catch {
      setError(t('setup.agentFetchError'));
    } finally {
      setLoading(false);
    }
    return null;
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Poll auth status while terminal is open — auto-close on success
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!terminal) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    const startPolling = () => {
      pollRef.current = setInterval(async () => {
        const data = await fetchAgents();
        if (data) {
          const agent = data.find((a: AgentInfo) => a.name === terminal.agent);
          if (agent?.onboarded) {
            setTerminal(null);
          }
        }
      }, 2000);
    };

    const delay = setTimeout(startPolling, 3000);
    return () => {
      clearTimeout(delay);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [terminal?.agent]);

  const handleConnect = async (agentName: string) => {
    try {
      const res = await fetch(`/api/setup/agents/install-command?agent=${agentName}`);
      if (res.ok) {
        const data = await res.json();
        const agent = agents.find((a) => a.name === agentName);
        const command = agent?.installed ? data.authCommand : `${data.installCommand} && ${data.authCommand}`;
        setTerminal({ agent: agentName, command });
      }
    } catch {
      // Silently fail
    }
  };

  const handleDisconnect = async (agentName: string) => {
    try {
      await fetch(`/api/setup/agents/disconnect?agent=${agentName}`, { method: 'POST' });
      fetchAgents();
    } catch {
      // Silently fail
    }
  };

  const handleTerminalClose = () => {
    setTerminal(null);
    fetchAgents();
  };

  const hasConnectedAgent = agents.some((a) => a.installed && a.authed && a.onboarded);

  const badgeColor = (badge: AgentInfo['badge']) => {
    switch (badge) {
      case 'stable': return 'bg-green/15 text-green';
      case 'experimental': return 'bg-orange/15 text-orange';
      case 'coming-soon': return 'bg-card-hover text-text-tertiary';
    }
  };

  const badgeLabel = (badge: AgentInfo['badge']) => {
    switch (badge) {
      case 'stable': return t('setup.agentStable');
      case 'experimental': return t('setup.agentExperimental');
      case 'coming-soon': return t('setup.agentComingSoon');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-text-secondary">{t('common.loading')}</div>;
  }

  if (error && agents.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-16">
        <p className="text-sm text-red">{t('setup.agentBackendError')}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); setError(null); fetchAgents(); }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex w-full max-w-lg flex-col gap-8"
      onSubmit={(e) => { e.preventDefault(); if (hasConnectedAgent) onNext(); }}
    >
      <div className="text-center">
        <h2 className="text-xl font-bold text-text">{t('setup.connectAgent')}</h2>
        <p className="mt-1 text-text-secondary text-sm">{t('setup.connectAgentDesc')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {agents.map((agent) => {
          const connected = agent.installed && agent.authed && agent.onboarded;
          return (
            <div
              key={agent.name}
              className="bg-card rounded-xl border border-border p-4 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text truncate">{agent.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${badgeColor(agent.badge)}`}>
                        {badgeLabel(agent.badge)}
                      </span>
                      {connected && (
                        <span className="flex items-center gap-1 text-green text-xs font-medium">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20,6 9,17 4,12" /></svg>
                          {t('setup.connected')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(agent.name)}
                      className="border border-red/30 text-red hover:bg-red/10 rounded-lg px-3 py-1.5 text-sm"
                    >
                      {t('setup.disconnect')}
                    </button>
                  ) : agent.badge === 'coming-soon' ? (
                    <span className="text-xs text-text-secondary">{t('setup.agentComingSoon')}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnect(agent.name)}
                      className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90"
                    >
                      {t('setup.connect')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-text transition-colors hover:bg-card"
        >
          {t('setup.back')}
        </button>
        <button
          type="submit"
          disabled={!hasConnectedAgent}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-40"
        >
          {t('setup.continue')}
        </button>
      </div>

      {terminal && (
        <TerminalDrawer
          open
          title={terminal.agent}
          command={terminal.command}
          onClose={handleTerminalClose}
        />
      )}
    </form>
  );
}
