// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import SuggestionCard from '../../shared/SuggestionCard';
import ExampleChips from './ExampleChips';

export default function Nouveau() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { suggestions, fetchSuggestions, createTask } = useStore();
  const [instruction, setInstruction] = useState('');
  const [launching, setLaunching] = useState(false);
  const launchingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  async function handleLaunch() {
    if (!instruction.trim() || launchingRef.current) return;
    launchingRef.current = true;
    setLaunching(true);
    try {
      const { tasks } = useStore.getState();
      if (tasks.length === 0) {
        localStorage.setItem('opentidy-onboarding-seen', 'true');
      }
      await createTask(instruction);
      navigate('/');
    } finally {
      launchingRef.current = false;
      setLaunching(false);
    }
  }

  return (
    <div className="p-5 md:p-7 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-text mb-1">{t('nouveau.title')}</h1>
      <p className="text-text-secondary text-sm mb-6">{t('nouveau.description')}</p>

      <ExampleChips onSelect={setInstruction} />

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={t('nouveau.placeholder')}
        className="w-full bg-card rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-tertiary resize-none h-40 focus:outline-none focus:ring-1 focus:ring-accent border-none"
      />

      <div className="flex flex-col gap-3 mt-3">
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // Append filename to instruction so the agent knows a file was attached
              setInstruction((prev) => prev ? `${prev}\n[attached: ${file.name}]` : `[attached: ${file.name}]`);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-text-tertiary hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            {t('common.files')}
          </button>
        </div>
        <button
          onClick={handleLaunch}
          disabled={!instruction.trim() || launching}
          className="w-full bg-accent text-white font-semibold rounded-xl py-3 text-sm shadow-[0_2px_8px_rgba(10,132,255,0.2)] disabled:opacity-40"
        >
          {t('common.launch')}
        </button>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rotate-45 bg-accent" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              {t('nouveau.recommendations')}
            </span>
          </div>
          <div className="space-y-3">
            {suggestions.map((s) => <SuggestionCard key={s.slug} suggestion={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
