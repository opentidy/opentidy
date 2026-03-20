// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TerminalDrawer } from '../../shared/TerminalDrawer';

interface AgentInfo {
  name: string;
  label: string;
  badge: 'stable' | 'experimental' | 'coming-soon';
  installed: boolean;
  authed: boolean;
}

interface AgentStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function AgentStep({ onNext, onBack }: AgentStepProps) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminal, setTerminal] = useState<{ agent: string; command: string } | null>(null);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/setup/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

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

  const handleTerminalClose = () => {
    setTerminal(null);
    fetchAgents();
  };

  const handleTerminalComplete = () => {
    fetchAgents();
  };

  const hasConnectedAgent = agents.some((a) => a.installed && a.authed);

  const badgeLabel = (badge: AgentInfo['badge']) => {
    switch (badge) {
      case 'stable':
        return t('setup.agentStable');
      case 'experimental':
        return t('setup.agentExperimental');
      case 'coming-soon':
        return t('setup.agentComingSoon');
    }
  };

  const badgeColor = (badge: AgentInfo['badge']) => {
    switch (badge) {
      case 'stable':
        return 'bg-green-500/15 text-green-400';
      case 'experimental':
        return 'bg-yellow-500/15 text-yellow-400';
      case 'coming-soon':
        return 'bg-fg-muted/15 text-fg-muted';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-fg-muted">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div className="text-center">
        <h2 className="text-xl font-bold text-fg">{t('setup.connectAgent')}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t('setup.connectAgentDesc')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {agents.map((agent) => {
          const connected = agent.installed && agent.authed;
          return (
            <div
              key={agent.name}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-fg">{agent.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor(agent.badge)}`}>
                  {badgeLabel(agent.badge)}
                </span>
              </div>

              {connected ? (
                <span className="text-sm font-medium text-green-400">{t('setup.connected')}</span>
              ) : agent.badge === 'coming-soon' ? (
                <span className="text-sm text-fg-muted">{t('setup.agentComingSoon')}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(agent.name)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  {t('setup.connect')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-fg transition-colors hover:bg-bg-secondary"
        >
          {t('setup.back')}
        </button>
        <button
          type="button"
          disabled={!hasConnectedAgent}
          onClick={onNext}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-opacity disabled:opacity-40"
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
          onComplete={handleTerminalComplete}
        />
      )}
    </div>
  );
}
