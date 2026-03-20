// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BASE = '/api';

type ServiceStatus = 'running' | 'stopped' | 'unknown';

export default function ServiceControlPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ServiceStatus>('unknown');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/health`)
      .then((res) => {
        setStatus(res.ok ? 'running' : 'stopped');
      })
      .catch(() => setStatus('stopped'));
  }, []);

  async function handleAction(action: 'start' | 'stop' | 'restart') {
    setActing(true);
    try {
      await fetch(`${BASE}/service/${action}`, { method: 'POST' });
      // Re-check status after action
      const res = await fetch(`${BASE}/health`);
      setStatus(res.ok ? 'running' : 'stopped');
    } catch {
      console.error(`[settings] service ${action} failed`);
    } finally {
      setActing(false);
    }
  }

  const statusLabel =
    status === 'running'
      ? t('settings.serviceRunning')
      : status === 'stopped'
        ? t('settings.serviceStopped')
        : t('common.loading');

  const statusColor =
    status === 'running'
      ? 'text-green-500'
      : status === 'stopped'
        ? 'text-red-500'
        : 'text-text-tertiary';

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t('settings.serviceControl')}</h2>
        <p className="text-xs text-text-tertiary">{t('settings.serviceControlDescription')}</p>
      </div>

      <div className="p-4 bg-bg rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                status === 'running' ? 'bg-green-500' : status === 'stopped' ? 'bg-red-500' : 'bg-gray-500'
              }`}
            />
            <div>
              <h3 className="text-sm font-medium">{t('settings.serviceHeading')}</h3>
              <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={acting || status === 'running'}
              onClick={() => handleAction('start')}
              className="px-3 py-1.5 text-sm border border-accent/30 text-accent rounded-lg hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.launch')}
            </button>
            <button
              type="button"
              disabled={acting || status === 'stopped'}
              onClick={() => handleAction('stop')}
              className="px-3 py-1.5 text-sm border border-border text-text-secondary rounded-lg hover:bg-card-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.stop')}
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => handleAction('restart')}
              className="px-3 py-1.5 text-sm border border-border text-text-secondary rounded-lg hover:bg-card-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('settings.restart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
