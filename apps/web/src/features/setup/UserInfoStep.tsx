// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UserInfoStepProps {
  onNext: (data: { name: string; language: string }) => void;
}

export function UserInfoStep({ onNext }: UserInfoStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(
    navigator.language.startsWith('fr') ? 'fr' : 'en',
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-fg">{t('setup.welcome')}</h1>
        <p className="mt-2 text-fg-muted">{t('setup.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('setup.name')}</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('setup.namePlaceholder')}
            className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-fg placeholder:text-fg-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('setup.language')}</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="en">English</option>
            <option value="fr">Fran&ccedil;ais</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => onNext({ name: name.trim(), language })}
        className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-opacity disabled:opacity-40"
      >
        {t('setup.continue')}
      </button>
    </div>
  );
}
