// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { McpConfigV2 } from '@opentidy/shared';
import AddMcpDialog from './AddMcpDialog';

const BASE = '/api';

interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  verified?: boolean;
  useCount: number;
  isDeployed?: boolean;
}

interface SearchResponse {
  servers: SmitheryServer[];
  pagination: { currentPage: number; totalPages: number; totalCount: number; pageSize: number };
}

const CATEGORIES = [
  { id: 'all', label: 'All', query: '' },
  { id: 'productivity', label: 'Productivity', query: 'notion google sheets calendar drive docs' },
  { id: 'communication', label: 'Communication', query: 'slack email gmail discord teams' },
  { id: 'developer', label: 'Developer', query: 'github gitlab jira linear sentry' },
  { id: 'search', label: 'Search', query: 'search brave exa tavily web' },
  { id: 'data', label: 'Data & DB', query: 'postgres supabase mongodb database sql' },
  { id: 'ai', label: 'AI & LLM', query: 'openai hugging context vector embedding' },
] as const;

async function searchRegistry(q: string, page = 1): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, page: String(page), pageSize: '15' });
  const res = await fetch(`${BASE}/mcp/registry/search?${params}`);
  if (!res.ok) return { servers: [], pagination: { currentPage: 1, totalPages: 0, totalCount: 0, pageSize: 15 } };
  return res.json();
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function ServerIcon({ server }: { server: SmitheryServer }) {
  const [imgError, setImgError] = useState(false);

  if (server.iconUrl && !imgError) {
    return (
      <img
        src={server.iconUrl}
        className="w-10 h-10 rounded-lg bg-card-hover object-cover"
        onError={() => setImgError(true)}
        alt=""
      />
    );
  }

  const initials = server.displayName.slice(0, 2).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-lg bg-card-hover flex items-center justify-center text-sm font-semibold text-text-tertiary shrink-0">
      {initials}
    </div>
  );
}

export default function MarketplacePanel() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [results, setResults] = useState<SmitheryServer[]>([]);
  const [pagination, setPagination] = useState<SearchResponse['pagination'] | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [addServer, setAddServer] = useState<SmitheryServer | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  // Load popular on mount
  useEffect(() => {
    loadServers('', 1);
  }, []);

  async function loadServers(q: string, page: number) {
    setLoading(true);
    try {
      const data = await searchRegistry(q, page);
      setResults(page === 1 ? data.servers : [...results, ...data.servers]);
      setPagination(data.pagination);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function handleSearch(value: string) {
    setQuery(value);
    setActiveCategory('all');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadServers(value, 1), 400);
  }

  function handleCategory(cat: typeof CATEGORIES[number]) {
    setActiveCategory(cat.id);
    setQuery('');
    loadServers(cat.query, 1);
  }

  function handleLoadMore() {
    if (!pagination || pagination.currentPage >= pagination.totalPages) return;
    const q = activeCategory === 'all' ? query : CATEGORIES.find(c => c.id === activeCategory)?.query || '';
    loadServers(q, pagination.currentPage + 1);
  }

  function handleAddServer(server: SmitheryServer) {
    setAddServer(server);
  }

  function handleAdded(_updated: McpConfigV2) {
    setAddServer(null);
    setShowCustom(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t('toolbox.marketplace')}</h2>
        <p className="text-xs text-text-tertiary">
          {pagination ? t('toolbox.serverCount', { count: pagination.totalCount }) : t('toolbox.marketplaceDescription')}
        </p>
      </div>

      <div className="bg-amber-500/10 text-amber-600 text-xs p-3 rounded-lg mb-5">
        {t('toolbox.communityWarning')}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-2.5 text-text-tertiary" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder={t('toolbox.searchPlaceholder')}
          className="w-full pl-10 pr-4 py-2.5 bg-bg border border-border rounded-lg text-sm placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
      </div>

      {/* Category filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategory(cat)}
            className={`px-3 py-1.5 text-xs rounded-full shrink-0 transition-colors ${
              activeCategory === cat.id
                ? 'bg-accent text-white'
                : 'bg-bg border border-border text-text-secondary hover:border-accent/50 hover:text-accent'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="space-y-2">
        {results.map((server) => (
          <div
            key={server.qualifiedName}
            className="flex items-center gap-3 p-3 bg-bg rounded-lg border border-border hover:border-accent/30 transition-colors"
          >
            <ServerIcon server={server} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{server.displayName}</span>
                {server.verified && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#3b82f6" className="shrink-0">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="white" strokeWidth="2" fill="none" />
                    <circle cx="12" cy="12" r="9" fill="#3b82f6" opacity="0.15" />
                  </svg>
                )}
                <span className="text-[10px] text-text-tertiary hidden sm:inline">{server.qualifiedName}</span>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{server.description}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  {formatCount(server.useCount)} uses
                </span>
              </div>
            </div>
            <button
              onClick={() => handleAddServer(server)}
              className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 shrink-0"
            >
              {t('toolbox.add')}
            </button>
          </div>
        ))}
      </div>

      {loading && (
        <div className="text-text-tertiary text-sm py-6 text-center animate-pulse">{t('toolbox.searching')}</div>
      )}

      {!loading && results.length === 0 && query && (
        <div className="text-text-tertiary text-sm py-8 text-center">
          {t('toolbox.noResults', { query })}
        </div>
      )}

      {/* Load more */}
      {pagination && pagination.currentPage < pagination.totalPages && !loading && (
        <div className="text-center mt-4">
          <button
            onClick={handleLoadMore}
            className="px-6 py-2 text-sm text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors"
          >
            {t('toolbox.loadMore')}
          </button>
        </div>
      )}

      {/* Custom add */}
      <div className="mt-6 pt-4 border-t border-border">
        <button
          onClick={() => setShowCustom(true)}
          className="text-sm text-text-tertiary hover:text-accent flex items-center gap-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('toolbox.addCustom')}
        </button>
      </div>

      {/* Add dialog — from marketplace */}
      {addServer && (
        <AddMcpDialog
          preset={{
            name: addServer.qualifiedName.split('/').pop() || addServer.qualifiedName,
            label: addServer.displayName,
            command: 'npx',
            args: `-y @smithery/cli@latest run ${addServer.qualifiedName}`,
            envVars: [],
          }}
          onClose={() => setAddServer(null)}
          onAdded={handleAdded}
        />
      )}

      {/* Add dialog — custom */}
      {showCustom && (
        <AddMcpDialog onClose={() => setShowCustom(false)} onAdded={handleAdded} />
      )}
    </div>
  );
}
