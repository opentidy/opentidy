// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPreferences, updatePreferences } from '../../shared/api';

const SCAN_OPTIONS = ['30m', '1h', '2h', '6h', 'disabled'] as const;
const RATE_OPTIONS = [0, 60_000, 300_000] as const;

export default function PreferencesPanel() {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState('en');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [scanInterval, setScanInterval] = useState('2h');
  const [notificationRateLimit, setNotificationRateLimit] = useState(60_000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences().then((prefs) => {
      setLanguage(prefs.language);
      setAutoUpdate(prefs.autoUpdate);
      setScanInterval(prefs.scanInterval);
      setNotificationRateLimit(prefs.notificationRateLimit);
    }).catch((err) => console.warn('[settings] fetchPreferences failed:', err));
  }, []);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updatePreferences(patch as any);
      setLanguage(updated.language);
      setAutoUpdate(updated.autoUpdate);
      setScanInterval(updated.scanInterval);
      setNotificationRateLimit(updated.notificationRateLimit);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[settings] updatePreferences failed:', err);
    } finally {
      setSaving(false);
    }
  }

  function handleLanguage(value: string) {
    setLanguage(value);
    i18n.changeLanguage(value);
    save({ language: value });
  }

  function handleAutoUpdate(checked: boolean) {
    setAutoUpdate(checked);
    save({ autoUpdate: checked });
  }

  function handleScanInterval(value: string) {
    setScanInterval(value);
    save({ scanInterval: value });
  }

  function handleNotificationRate(value: number) {
    setNotificationRateLimit(value);
    save({ notificationRateLimit: value });
  }

  const scanLabels: Record<string, string> = {
    '30m': t('settings.prefScan30m'),
    '1h': t('settings.prefScan1h'),
    '2h': t('settings.prefScan2h'),
    '6h': t('settings.prefScan6h'),
    disabled: t('settings.prefScanDisabled'),
  };

  const rateLabels: Record<number, string> = {
    0: t('settings.prefRateInstant'),
    60_000: t('settings.prefRate1m'),
    300_000: t('settings.prefRate5m'),
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a]">{t('settings.preferences')}</h2>
          <p className="text-xs text-text-tertiary">{t('settings.preferencesDescription')}</p>
        </div>
        {saved && <span className="text-xs text-green">{t('settings.prefSaved')}</span>}
      </div>

      <div className="bg-card rounded-xl divide-y divide-border">
        {/* Language */}
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-sm font-medium">{t('settings.prefLanguage')}</h3>
          </div>
          <select
            value={language}
            onChange={(e) => handleLanguage(e.target.value)}
            disabled={saving}
            className="bg-card-hover rounded-lg px-3 py-1.5 text-xs text-text-secondary"
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </div>

        {/* Periodic scan */}
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-sm font-medium">{t('settings.prefScanInterval')}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">{t('settings.prefScanIntervalDesc')}</p>
          </div>
          <select
            value={scanInterval}
            onChange={(e) => handleScanInterval(e.target.value)}
            disabled={saving}
            className="bg-card-hover rounded-lg px-3 py-1.5 text-xs text-text-secondary"
          >
            {SCAN_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{scanLabels[opt]}</option>
            ))}
          </select>
        </div>

        {/* Auto-update */}
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-sm font-medium">{t('settings.prefAutoUpdate')}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">{t('settings.prefAutoUpdateDesc')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoUpdate}
            onClick={() => handleAutoUpdate(!autoUpdate)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
              autoUpdate ? 'bg-green' : 'bg-[#48484a]'
            } disabled:opacity-50`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                autoUpdate ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Notification rate limit */}
        <div className="flex items-center justify-between p-4">
          <div>
            <h3 className="text-sm font-medium">{t('settings.prefNotificationRate')}</h3>
            <p className="text-xs text-text-tertiary mt-0.5">{t('settings.prefNotificationRateDesc')}</p>
          </div>
          <select
            value={notificationRateLimit}
            onChange={(e) => handleNotificationRate(Number(e.target.value))}
            disabled={saving}
            className="bg-card-hover rounded-lg px-3 py-1.5 text-xs text-text-secondary"
          >
            {RATE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{rateLabels[opt]}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
