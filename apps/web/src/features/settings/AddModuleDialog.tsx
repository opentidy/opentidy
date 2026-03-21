// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AddModuleDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

interface RegistryResult {
  name: string;
  description: string;
  command?: string;
  args?: string[];
}

const BASE = '/api';

type Tab = 'registry' | 'custom';

export default function AddModuleDialog({ open, onClose, onAdded }: AddModuleDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('registry');

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">{t('modules.addModule')}</h3>

        <div className="flex gap-1 mb-6 border border-border rounded-lg p-1 bg-bg">
          <button
            type="button"
            onClick={() => setTab('registry')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'registry'
                ? 'bg-card text-text font-medium shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {t('modules.fromRegistry')}
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === 'custom'
                ? 'bg-card text-text font-medium shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {t('modules.custom')}
          </button>
        </div>

        {tab === 'registry' ? (
          <RegistryTab onAdded={onAdded} onClose={onClose} />
        ) : (
          <CustomTab onAdded={onAdded} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function RegistryTab({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegistryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [comingSoon, setComingSoon] = useState(false);
  const [addingName, setAddingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      setComingSoon(false);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/modules/registry/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setComingSoon(true);
        setResults([]);
      } else {
        const data = await res.json();
        setResults(data.results ?? []);
        setComingSoon(false);
      }
    } catch {
      setComingSoon(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(result: RegistryResult) {
    setAddingName(result.name);
    setError(null);
    try {
      const res = await fetch(`${BASE}/modules/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: result.name,
          manifest: {
            name: result.name,
            label: result.name,
            description: result.description,
            version: '1.0.0',
            mcpServers: [
              {
                name: result.name,
                command: result.command ?? 'npx',
                args: result.args ?? ['-y', result.name],
              },
            ],
          },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      onAdded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingName(null);
    }
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={t('modules.searchRegistry')}
        className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {searching && (
        <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>
      )}

      {comingSoon && !searching && (
        <div className="text-text-tertiary text-sm text-center py-6">{t('modules.comingSoon')}</div>
      )}

      {error && (
        <div className="text-red text-sm p-3 bg-red/10 rounded-lg">{error}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={result.name}
              className="flex items-start justify-between gap-3 p-3 border border-border rounded-lg bg-card"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{result.name}</p>
                {result.description && (
                  <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{result.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleAdd(result)}
                disabled={addingName === result.name}
                className="shrink-0 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {addingName === result.name ? t('common.loading') : t('modules.add')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onClose}
          className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs transition-colors"
        >
          {t('modules.cancel')}
        </button>
      </div>
    </div>
  );
}

function CustomTab({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !command.trim() || !args.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsedArgs = args.trim().split(/\s+/);
      const res = await fetch(`${BASE}/modules/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          manifest: {
            name: name.trim(),
            label: name.trim(),
            description: '',
            version: '1.0.0',
            mcpServers: [
              {
                name: name.trim(),
                command: command.trim(),
                args: parsedArgs,
              },
            ],
          },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      onAdded();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm text-text-secondary">
          {t('common.name') !== 'common.name' ? t('common.name') : 'Name'}
          <span className="text-red ml-0.5">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-mcp-server"
          required
          className="w-full mt-1 bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label className="text-sm text-text-secondary">
          {t('modules.command')}
          <span className="text-red ml-0.5">*</span>
        </label>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="npx"
          required
          className="w-full mt-1 bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label className="text-sm text-text-secondary">
          {t('modules.args')}
          <span className="text-red ml-0.5">*</span>
        </label>
        <input
          type="text"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="-y some-mcp-server"
          required
          className="w-full mt-1 bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && (
        <div className="text-red text-sm p-3 bg-red/10 rounded-lg">{error}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs transition-colors"
        >
          {t('modules.cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !command.trim() || !args.trim()}
          className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs disabled:opacity-50 transition-colors"
        >
          {submitting ? t('common.loading') : t('modules.add')}
        </button>
      </div>
    </form>
  );
}
