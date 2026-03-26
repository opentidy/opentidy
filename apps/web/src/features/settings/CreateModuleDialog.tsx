// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const MODULE_NAME_REGEX = /^[a-z0-9-]+$/;

interface CreateModuleDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}

export default function CreateModuleDialog({ open, onClose, onCreated }: CreateModuleDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name || !MODULE_NAME_REGEX.test(name)) {
      setError(t('modules.moduleNameError'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/modules/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }

      const { taskId } = await res.json() as { taskId: string };
      onClose();
      setName('');
      onCreated(taskId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-secondary rounded-xl p-6 w-full max-w-md shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{t('modules.createModule')}</h3>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-text-secondary mb-1">{t('modules.moduleName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('modules.moduleNamePlaceholder')}
            className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            autoFocus
          />
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !name}
              className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? t('modules.creating') : t('modules.createModule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
