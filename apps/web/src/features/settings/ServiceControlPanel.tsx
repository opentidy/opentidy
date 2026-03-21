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
      ? 'text-green'
      : status === 'stopped'
        ? 'text-red'
        : 'text-text-tertiary';

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a]">{t('settings.serviceControl')}</h2>
        <p className="text-xs text-text-tertiary">{t('settings.serviceControlDescription')}</p>
      </div>

      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                status === 'running' ? 'bg-green' : status === 'stopped' ? 'bg-red' : 'bg-text-tertiary'
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
              className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.launch')}
            </button>
            <button
              type="button"
              disabled={acting || status === 'stopped'}
              onClick={() => handleAction('stop')}
              className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.stop')}
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => handleAction('restart')}
              className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('settings.restart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
