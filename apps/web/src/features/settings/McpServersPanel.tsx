// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { McpConfigV2, MarketplaceMcp } from '@opentidy/shared';

const BASE = '/api';

async function fetchMcp(): Promise<McpConfigV2> {
  const res = await fetch(`${BASE}/mcp`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function toggleCurated(name: string): Promise<McpConfigV2> {
  const res = await fetch(`${BASE}/mcp/curated/${name}/toggle`, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function removeMarketplace(name: string): Promise<McpConfigV2> {
  const res = await fetch(`${BASE}/mcp/marketplace/${name}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function Toggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? 'bg-accent' : 'bg-border'}`}>
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${enabled ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  );
}

function Avatar({ name, className = '' }: { name: string; className?: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-lg bg-card-hover flex items-center justify-center text-sm font-semibold text-text-tertiary ${className}`}>
      {initials}
    </div>
  );
}

export default function McpServersPanel() {
  const { t } = useTranslation();
  const [mcp, setMcp] = useState<McpConfigV2 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMcp().then(setMcp).catch(e => setError(e.message));
  }, []);

  async function handleToggle(name: string) {
    try {
      setMcp(await toggleCurated(name));
    } catch (e) { setError((e as Error).message); }
  }

  async function handleRemove(name: string) {
    try {
      setMcp(await removeMarketplace(name));
    } catch (e) { setError((e as Error).message); }
  }

  if (error && !mcp) return <div className="text-red-500 text-sm p-3 bg-red-500/10 rounded-lg">{error}</div>;
  if (!mcp) return <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>;

  const curatedEntries = Object.entries(mcp.curated) as [string, { enabled: boolean; configured: boolean }][];
  const marketplaceEntries = Object.entries(mcp.marketplace) as [string, MarketplaceMcp][];
  const activeCount = curatedEntries.filter(([, s]) => s.enabled).length + marketplaceEntries.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t('toolbox.mcpServers')}</h2>
          <p className="text-xs text-text-tertiary">{t('toolbox.mcpActiveCount', { count: activeCount })}</p>
        </div>
      </div>

      {error && <div className="text-red-500 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{error}</div>}

      <div className="space-y-3">
        {curatedEntries.map(([name, state]) => (
          <div key={name} className={`flex items-center gap-4 p-4 bg-bg rounded-lg border border-border transition-opacity ${!state.enabled ? 'opacity-60' : ''}`}>
            <Avatar name={name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">{t('toolbox.verified')}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${state.configured ? 'bg-green-500/10 text-green-500' : 'bg-card-hover text-text-tertiary'}`}>
                  {state.configured ? t('toolbox.configured') : t('toolbox.notConfigured')}
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary mt-1 font-mono">mcp__{name}__*</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!state.configured && (
                <button className="text-xs text-accent hover:underline">{t('toolbox.setup')}</button>
              )}
              <Toggle enabled={state.enabled} onClick={() => handleToggle(name)} />
            </div>
          </div>
        ))}

        {marketplaceEntries.map(([name, def]) => (
          <div key={name} className="flex items-center gap-4 p-4 bg-bg rounded-lg border border-amber-500/20">
            <Avatar name={name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{def.label || name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">{t('toolbox.community')}</span>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5 truncate">{def.command} {def.args.join(' ')}</p>
              <div className="text-[10px] text-text-tertiary mt-1 font-mono">mcp__{name}__* — {t('toolbox.auditOnly')}</div>
            </div>
            <button
              onClick={() => handleRemove(name)}
              className="text-xs text-red-400 hover:text-red-300 shrink-0"
            >
              {t('toolbox.remove')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
