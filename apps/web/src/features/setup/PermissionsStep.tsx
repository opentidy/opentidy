// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Permission {
  id: string;
  name: string;
  required: boolean;
  granted: boolean;
}

interface PermissionsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function PermissionsStep({ onNext, onBack }: PermissionsStepProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState<string | null>(null);

  const fetchPermissions = async () => {
    try {
      const res = await fetch('/api/setup/permissions');
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const handleGrant = async (id: string) => {
    setGranting(id);
    try {
      await fetch('/api/setup/permissions/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetch('/api/setup/permissions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchPermissions();
    } catch {
      // Silently fail
    } finally {
      setGranting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-fg-muted">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div className="text-center">
        <h2 className="text-xl font-bold text-fg">{t('setup.permissions')}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t('setup.permissionsDesc')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {permissions.map((perm) => (
          <div
            key={perm.id}
            className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-fg">{perm.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  perm.required
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-fg-muted/15 text-fg-muted'
                }`}
              >
                {perm.required ? t('setup.required') : t('setup.optional')}
              </span>
            </div>

            {perm.granted ? (
              <span className="text-sm font-medium text-green-400">{t('setup.authorized')}</span>
            ) : (
              <button
                type="button"
                disabled={granting === perm.id}
                onClick={() => handleGrant(perm.id)}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {granting === perm.id ? t('common.loading') : t('setup.authorize')}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-2.5 font-medium text-fg transition-colors hover:bg-bg-secondary"
        >
          {t('setup.back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-opacity"
        >
          {t('setup.continue')}
        </button>
      </div>
    </div>
  );
}
