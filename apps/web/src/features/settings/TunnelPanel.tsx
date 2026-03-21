// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface TunnelStatus {
  installed: boolean;
  configured: boolean;
  hostname: string | null;
  tunnelName: string | null;
  serviceRunning: boolean;
}

export default function TunnelPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/tunnel')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a]">
            {t('settings.tunnel')}
          </h2>
          <p className="text-xs text-text-tertiary">{t('settings.tunnelDescription')}</p>
        </div>
        <div className="text-text-tertiary text-sm animate-pulse">{t('common.loading')}</div>
      </div>
    );
  }

  const notInstalled = !status?.installed;
  const notConfigured = status?.installed && !status?.configured;
  const ready = status?.configured;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[#48484a]">
          {t('settings.tunnel')}
        </h2>
        <p className="text-xs text-text-tertiary">{t('settings.tunnelDescription')}</p>
      </div>

      <div className="bg-card rounded-xl p-4 space-y-3">
        {/* Status indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                ready && status?.serviceRunning
                  ? 'bg-green'
                  : ready
                    ? 'bg-yellow'
                    : 'bg-text-tertiary'
              }`}
            />
            <div>
              <h3 className="text-sm font-medium">{t('settings.tunnelHeading')}</h3>
              <span className={`text-xs ${
                ready && status?.serviceRunning
                  ? 'text-green'
                  : ready
                    ? 'text-yellow'
                    : 'text-text-tertiary'
              }`}>
                {notInstalled
                  ? t('settings.tunnelNotInstalled')
                  : notConfigured
                    ? t('settings.tunnelNotConfigured')
                    : status?.serviceRunning
                      ? t('settings.tunnelRunning')
                      : t('settings.tunnelStopped')}
              </span>
            </div>
          </div>
        </div>

        {/* Details when configured */}
        {ready && (
          <div className="space-y-2 pt-1">
            {status?.hostname && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-tertiary">{t('settings.tunnelHostname')}</span>
                <span className="font-mono text-text-secondary">{status.hostname}</span>
              </div>
            )}
            {status?.tunnelName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-tertiary">{t('settings.tunnelName')}</span>
                <span className="font-mono text-text-secondary">{status.tunnelName}</span>
              </div>
            )}
          </div>
        )}

        {/* Setup hint */}
        {!ready && (
          <p className="text-xs text-text-tertiary pt-1">
            {t('settings.tunnelSetupHint')}
          </p>
        )}
      </div>
    </div>
  );
}
