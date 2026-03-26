// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Permission {
  name: string;
  label: string;
  description: string;
  required: boolean;
  granted: boolean;
}

const INSTRUCTIONS: Record<string, string[]> = {
  'full-disk-access': [
    'Click "Authorize". System Settings will open to Privacy & Security',
    'Find "Full Disk Access" in the list',
    'Find the terminal app you used to install OpenTidy and toggle it ON (if unsure, it\'s probably "Terminal")',
    'Come back here, it will update automatically',
  ],
  accessibility: [
    'Click "Authorize". System Settings will open to Privacy & Security',
    'Find "Accessibility" in the list',
    'Click + and add the terminal app you used to install OpenTidy (if unsure, it\'s probably "Terminal")',
    'Come back here, it will update automatically',
  ],
};

interface PermissionsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function PermissionsStep({ onNext, onBack }: PermissionsStepProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recheck = async () => {
    try {
      const res = await fetch('/api/setup/permissions/recheck', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const perms: Permission[] = data.permissions ?? [];
        setPermissions(perms);
        // Stop polling if all granted
        if (perms.every((p) => p.granted) && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetch('/api/setup/permissions')
      .then((r) => r.json())
      .then((data) => {
        const perms: Permission[] = data.permissions ?? [];
        setPermissions(perms);
        // Start polling immediately if not all granted, so already-granted
        // permissions are detected without needing to click "Authorize"
        if (!perms.every((p) => p.granted)) {
          startPolling();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Start polling when a grant is triggered
  const startPolling = () => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(recheck, 2000);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleGrant = async (name: string) => {
    setGranting(name);
    try {
      // Opens System Settings to the right pane
      await fetch('/api/setup/permissions/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: name }),
      });
      // Start polling to detect when user grants the permission in System Settings
      startPolling();
    } catch {
      // ignore
    } finally {
      setGranting(null);
    }
  };

  const allGranted = permissions.length > 0 && permissions.every((p) => p.granted);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-text-secondary">{t('common.loading')}</div>;
  }

  return (
    <form
      className="mx-auto flex w-full max-w-lg flex-col gap-8"
      onSubmit={(e) => { e.preventDefault(); if (allGranted) onNext(); }}
    >
      <div className="text-center">
        <h2 className="text-xl font-bold text-text">{t('setup.permissions')}</h2>
        <p className="mt-1 text-text-secondary text-sm">
          OpenTidy runs from your terminal, so macOS requires you to grant permissions to the terminal app that launched it. This is standard for all command-line tools on macOS.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {permissions.map((perm) => (
          <div
            key={perm.name}
            className={`rounded-lg border px-4 py-4 ${
              perm.granted ? 'border-green/30 bg-green/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-text">{perm.label}</span>
                <p className="mt-0.5 text-xs text-text-secondary">{perm.description}</p>
              </div>
              {perm.granted ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-green">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20,6 9,17 4,12" /></svg>
                    {t('setup.authorized')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleGrant(perm.name)}
                    className="text-xs text-text-secondary underline hover:text-text"
                  >
                    Settings
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={granting !== null}
                  onClick={() => handleGrant(perm.name)}
                  className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  {granting === perm.name ? '...' : t('setup.authorize')}
                </button>
              )}
            </div>

            {/* Step-by-step instructions, visible until granted */}
            {!perm.granted && (
              <ol className="mt-3 space-y-1 border-t border-border-subtle pt-3">
                {(INSTRUCTIONS[perm.name] ?? []).map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[12px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-text hover:bg-card"
        >
          {t('setup.back')}
        </button>
        <button
          type="submit"
          disabled={!allGranted}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-40"
        >
          {t('setup.continue')}
        </button>
      </div>
    </form>
  );
}
