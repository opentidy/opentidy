// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UserInfoStepProps {
  onNext: (data: { name: string; language: string }) => void;
  initialName?: string;
  initialLanguage?: string;
}

export function UserInfoStep({ onNext, initialName = '', initialLanguage }: UserInfoStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [language, setLanguage] = useState(
    initialLanguage || (navigator.language.startsWith('fr') ? 'fr' : 'en'),
  );

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-6"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) onNext({ name: name.trim(), language }); }}
    >
      <div className="text-center">
        <h1 className="text-xl font-bold text-text">{t('setup.welcome')}</h1>
        <p className="mt-1 text-text-secondary text-sm">{t('setup.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">{t('setup.name')}</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('setup.namePlaceholder')}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">{t('setup.language')}</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="en">English</option>
            <option value="fr">Fran&ccedil;ais</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={!name.trim()}
        className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-40"
      >
        {t('setup.continue')}
      </button>
    </form>
  );
}
