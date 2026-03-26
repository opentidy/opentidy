// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../shared/store';
import * as api from '../../shared/api';
import type { MemoryIndexEntry } from '@opentidy/shared';

export default function Memory() {
  const { t } = useTranslation();
  const { memoryIndex, selectedMemory, memoryLoading, fetchMemoryIndex, selectMemory, clearSelectedMemory } = useStore();
  const [prompt, setPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [editorCategory, setEditorCategory] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchMemoryIndex(); }, [fetchMemoryIndex]);

  useEffect(() => {
    if (selectedMemory) {
      setEditorContent(selectedMemory.content);
      setEditorCategory(selectedMemory.category);
      setEditorDescription(selectedMemory.description);
    }
  }, [selectedMemory]);

  const handlePromptSubmit = async () => {
    if (!prompt.trim()) return;
    setPromptLoading(true);
    try {
      await api.sendMemoryPrompt(prompt.trim());
      setPrompt('');
      await fetchMemoryIndex();
    } catch (err) {
      console.error('[memory] prompt failed:', (err as Error).message);
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedMemory) return;
    setSaving(true);
    try {
      await api.updateMemoryFile(selectedMemory.filename, {
        content: editorContent,
        category: editorCategory,
        description: editorDescription,
      });
      await fetchMemoryIndex();
    } catch (err) {
      console.error('[memory] save failed:', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!selectedMemory) return;
    setSaving(true);
    try {
      await api.archiveMemoryFile(selectedMemory.filename);
      clearSelectedMemory();
      await fetchMemoryIndex();
    } catch (err) {
      console.error('[memory] archive failed:', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 md:p-7">
      <h1 className="text-xl font-bold text-text mb-6">{t('memory.title')}</h1>

      {/* Prompt input */}
      <div className="bg-card rounded-xl p-4 mb-6 border border-border">
        <label className="text-sm font-medium text-text-secondary mb-2 block">
          {t('memory.naturalLanguageInstruction')}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('memory.placeholder')}
          rows={3}
          className="w-full bg-card rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handlePromptSubmit}
            disabled={promptLoading || !prompt.trim()}
            className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {promptLoading ? t('memory.sending') : t('common.send')}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Memory list */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[#48484a]">{t('common.files')}</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-card text-text-tertiary font-medium">
              {memoryIndex.length}
            </span>
          </div>

          {memoryLoading && memoryIndex.length === 0 ? (
            <p className="text-text-tertiary text-sm py-8 text-center">{t('common.loading')}</p>
          ) : memoryIndex.length === 0 ? (
            <p className="text-text-tertiary text-sm py-8 text-center">
              {t('memory.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#48484a] text-[12px] font-semibold uppercase tracking-wider border-b border-border">
                    <th className="pb-2 pr-4">{t('memory.file')}</th>
                    <th className="pb-2 pr-4">{t('memory.category')}</th>
                    <th className="pb-2 pr-4">{t('memory.updated')}</th>
                    <th className="pb-2">{t('memory.description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {memoryIndex.map((entry: MemoryIndexEntry) => (
                    <tr
                      key={entry.filename}
                      onClick={() => selectMemory(entry.filename)}
                      className={`border-b border-border-subtle cursor-pointer hover:bg-card-hover transition-colors ${
                        selectedMemory?.filename === entry.filename ? 'bg-accent/10' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-mono text-text">{entry.filename}</td>
                      <td className="py-2.5 pr-4">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple/10 text-purple">
                          {entry.category}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-text-tertiary">{entry.updated}</td>
                      <td className="py-2.5 text-text-secondary">{entry.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Editor panel */}
        {selectedMemory && (
          <div className="lg:w-[480px] shrink-0">
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-text font-mono">{selectedMemory.filename}</h2>
                <button
                  onClick={clearSelectedMemory}
                  className="text-text-tertiary hover:text-text transition-colors text-xs"
                >
                  {t('common.close')}
                </button>
              </div>

              <div className="flex gap-3 mb-3">
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary mb-1 block">{t('memory.category')}</label>
                  <input
                    type="text"
                    value={editorCategory}
                    onChange={(e) => setEditorCategory(e.target.value)}
                    className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary mb-1 block">{t('memory.description')}</label>
                  <input
                    type="text"
                    value={editorDescription}
                    onChange={(e) => setEditorDescription(e.target.value)}
                    className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <label className="text-xs text-text-tertiary mb-1 block">{t('memory.content')}</label>
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                rows={12}
                className="w-full bg-card rounded-lg px-3 py-2 text-sm text-text font-mono resize-none border-none focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs transition-colors disabled:opacity-50"
                >
                  {saving ? t('memory.saving') : t('memory.save')}
                </button>
                <button
                  onClick={handleArchive}
                  disabled={saving}
                  className="bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs transition-colors disabled:opacity-50"
                >
                  {t('memory.archive')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}