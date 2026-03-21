// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TtydTerminal } from './TtydTerminal';

interface TerminalDrawerProps {
  open: boolean;
  title: string;
  /** Module name — backend looks up authCommand from manifest */
  moduleName?: string;
  /** Direct command — used when not tied to a module (e.g. agent setup) */
  command?: string;
  onClose: () => void;
}

export function TerminalDrawer({ open, title, moduleName, command, onClose }: TerminalDrawerProps) {
  const { t } = useTranslation();
  const [port, setPort] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setPort(null); setError(null); return; }

    let cancelled = false;
    (async () => {
      try {
        const body = moduleName ? { module: moduleName } : { command };
        const res = await fetch('/api/terminal/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setPort(data.port);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => { cancelled = true; };
  }, [open, moduleName, command]);

  if (!open) return null;

  return (
    <div
      data-testid="terminal-drawer"
      className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l border-border bg-surface"
      style={{ width: '50vw' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="truncate font-mono text-sm font-medium text-text/90">{title}</span>
        <button
          type="button"
          aria-label={t('setup.terminal.close')}
          onClick={onClose}
          className="rounded p-1 text-text-tertiary hover:bg-card hover:text-text transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Terminal body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full text-red text-sm font-mono px-4">
            {error}
          </div>
        ) : port ? (
          <TtydTerminal port={port} title={title} />
        ) : (
          <div className="flex items-center justify-center h-full text-orange text-sm font-mono">
            {t('setup.terminal.connecting')}
          </div>
        )}
      </div>
    </div>
  );
}
