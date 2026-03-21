// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BASE = '/api';

interface AgentInfo {
  name: string;
  label: string;
  badge: 'stable' | 'experimental' | 'coming-soon';
  installed: boolean;
  authed: boolean;
  active: boolean;
}

interface AgentsResponse {
  agents: AgentInfo[];
}

async function fetchAgents(): Promise<AgentsResponse> {
  const res = await fetch(`${BASE}/setup/agents`);
  if (!res.ok) throw new Error(`${res.status}`);
  const agents = await res.json();
  return { agents };
}

function AgentIcon({ agent }: { agent: AgentInfo }) {
  const abbr: Record<string, string> = { claude: 'CC', gemini: 'GC', copilot: 'CP' };
  const colors: Record<string, string> = {
    claude: agent.active ? 'bg-accent/20 text-accent' : 'bg-card-hover text-text-tertiary',
    gemini: 'bg-accent/10 text-accent',
    copilot: 'bg-purple/10 text-purple',
  };

  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${colors[agent.name] || 'bg-card-hover text-text-tertiary'}`}>
      {abbr[agent.name] || agent.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function badgeLabel(badge: string): string {
  if (badge === 'stable') return 'Stable';
  if (badge === 'experimental') return 'Experimental';
  return 'Coming soon';
}

export default function AgentsPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents().then(setData).catch(e => setError(e.message));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleActivate(_name: string) {
    // Agent activation not yet implemented in module system
    setError('Agent switching not yet available');
  }

  if (error && !data) return <div className="text-red text-sm p-3 bg-red/10 rounded-lg">{error}</div>;
  if (!data) return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t('toolbox.agentsTitle')}</h2>
        <p className="text-xs text-text-tertiary">{t('toolbox.agentsDescription')}</p>
      </div>

      {error && <div className="text-red text-sm mb-4 p-3 bg-red/10 rounded-lg">{error}</div>}

      <div className="space-y-3">
        {data.agents.map((agent) => (
          <div
            key={agent.name}
            className={`bg-card rounded-xl p-4 border transition-colors ${
              agent.active ? 'border-accent/40' : 'border-border'
            } ${agent.badge === 'coming-soon' ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-4">
              <AgentIcon agent={agent} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{agent.label}</span>
                  {agent.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t('toolbox.activeAgent')}</span>
                  )}
                  {agent.badge !== 'stable' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${agent.badge === 'experimental' ? 'bg-orange/10 text-orange' : 'bg-card-hover text-text-tertiary'}`}>{badgeLabel(agent.badge)}</span>
                  )}
                </div>

                {agent.installed ? (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-green text-xs flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12" /></svg>
                      {t('toolbox.installed')}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="text-xs text-text-tertiary">{t('toolbox.notInstalled')}</span>
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {agent.active ? (
                  <span className="text-xs text-accent px-3 py-1.5">{t('toolbox.current')}</span>
                ) : agent.installed && agent.badge === 'stable' ? (
                  <button
                    onClick={() => handleActivate(agent.name)}
                    className="px-4 py-1.5 text-sm border border-accent/30 text-accent rounded-lg hover:bg-accent/10"
                  >
                    {t('toolbox.activate')}
                  </button>
                ) : (
                  <span className="text-xs text-text-tertiary px-3 py-1.5">{t('toolbox.comingSoon')}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
