// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BASE = '/api';

interface AgentInfo {
  name: string;
  label: string;
  binary: string;
  installed: boolean;
  version: string | null;
  experimental: boolean;
  active: boolean;
  configDir: string;
}

interface AgentsResponse {
  active: string;
  agents: AgentInfo[];
}

async function fetchAgents(): Promise<AgentsResponse> {
  const res = await fetch(`${BASE}/agents`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function setActiveAgent(name: string): Promise<{ active: string }> {
  const res = await fetch(`${BASE}/agents/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status}`);
  }
  return res.json();
}

function AgentIcon({ agent }: { agent: AgentInfo }) {
  const abbr: Record<string, string> = { claude: 'CC', gemini: 'GC', copilot: 'CP' };
  const colors: Record<string, string> = {
    claude: agent.active ? 'bg-accent/20 text-accent' : 'bg-card-hover text-text-tertiary',
    gemini: 'bg-blue-500/10 text-blue-400',
    copilot: 'bg-purple-500/10 text-purple-400',
  };

  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${colors[agent.name] || 'bg-card-hover text-text-tertiary'}`}>
      {abbr[agent.name] || agent.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function AgentsPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents().then(setData).catch(e => setError(e.message));
  }, []);

  async function handleActivate(name: string) {
    try {
      setError(null);
      await setActiveAgent(name);
      const updated = await fetchAgents();
      setData(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !data) return <div className="text-red-500 text-sm p-3 bg-red-500/10 rounded-lg">{error}</div>;
  if (!data) return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t('toolbox.agentsTitle')}</h2>
        <p className="text-xs text-text-tertiary">{t('toolbox.agentsDescription')}</p>
      </div>

      {error && <div className="text-red-500 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{error}</div>}

      <div className="space-y-3">
        {data.agents.map((agent) => (
          <div
            key={agent.name}
            className={`p-4 bg-bg rounded-lg border transition-colors ${
              agent.active ? 'border-accent/40' : 'border-border'
            } ${agent.experimental && !agent.installed ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-4">
              <AgentIcon agent={agent} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{agent.label}</span>
                  {agent.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{t('toolbox.activeAgent')}</span>
                  )}
                  {agent.experimental && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">{t('toolbox.experimental')}</span>
                  )}
                </div>

                {agent.installed ? (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-green-500 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12" /></svg>
                      {t('toolbox.installed')}
                    </span>
                    {agent.version && <span className="text-[10px] text-text-tertiary font-mono">v{agent.version}</span>}
                    {agent.configDir && <span className="text-[10px] text-text-tertiary truncate hidden sm:inline">{agent.configDir}</span>}
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
                ) : agent.installed && !agent.experimental ? (
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
