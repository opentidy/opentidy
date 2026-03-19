// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TerminalStatus = 'connecting' | 'running' | 'completed' | 'error';

interface TerminalDrawerProps {
  open: boolean;
  title: string;
  command: string;
  onClose: () => void;
  onComplete?: () => void;
  onError?: () => void;
}

export function TerminalDrawer({ open, title, command, onClose, onComplete, onError }: TerminalDrawerProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!open || !terminalRef.current) return;

    setStatus('connecting');

    let disposed = false;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fitAddon: any = null;

    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { WebLinksAddon } = await import('@xterm/addon-web-links');

      if (disposed || !terminalRef.current) return;

      term = new Terminal({
        theme: {
          background: '#1a1a2e',
          foreground: '#e0e0e0',
          cursor: '#e0e0e0',
          selectionBackground: '#3c3c5e',
        },
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        convertEol: true,
        scrollback: 5000,
      });

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal/pty?command=${btoa(command)}`);

      ws.onopen = () => {
        if (disposed) return;
        setStatus('running');
      };

      ws.onmessage = (evt: MessageEvent) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(evt.data as string);
          if (typeof msg.exit === 'number') {
            if (msg.exit === 0) {
              setStatus('completed');
              onComplete?.();
            } else {
              setStatus('error');
              onError?.();
            }
            return;
          }
          if (typeof msg.error === 'string') {
            term.write(`\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`);
            setStatus('error');
            onError?.();
            return;
          }
        } catch {
          // Not JSON — raw terminal data
        }
        term.write(evt.data as string);
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus((prev) => (prev === 'running' ? 'error' : prev));
      };

      term.onData((data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      resizeObserver = new ResizeObserver(() => {
        if (fitAddon && !disposed) {
          fitAddon.fit();
        }
      });

      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (ws) {
        ws.close();
      }
      if (term) {
        term.dispose();
      }
    };
  }, [open, command, retryCount]); // retryCount triggers re-connection on retry

  if (!open) return null;

  const statusLabel = t(`setup.terminal.${status}`);

  const statusColor =
    status === 'connecting'
      ? 'text-yellow-400'
      : status === 'running'
        ? 'text-blue-400'
        : status === 'completed'
          ? 'text-green-400'
          : 'text-red-400';

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
  };

  return (
    <div
      data-testid="terminal-drawer"
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-white/10"
      style={{ height: '40vh', backgroundColor: '#1a1a2e' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="truncate font-mono text-sm font-medium text-white/90">{title}</span>

        <div className="flex shrink-0 items-center gap-3">
          <span className={`font-mono text-xs ${statusColor}`}>{statusLabel}</span>

          {status === 'error' && (
            <button
              type="button"
              onClick={handleRetry}
              className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/80 hover:bg-white/20 transition-colors"
            >
              {t('setup.terminal.retry')}
            </button>
          )}

          <button
            type="button"
            aria-label={t('setup.terminal.close')}
            onClick={onClose}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors"
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
      </div>

      {/* Terminal body */}
      <div ref={terminalRef} className="min-h-0 flex-1 overflow-hidden p-1" />
    </div>
  );
}
