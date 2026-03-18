import { useEffect, useState } from 'react';
import { useStore } from '../store';
import * as api from '../api';
import type { MemoryIndexEntry } from '@alfred/shared';

export default function Memory() {
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
    <div className="p-6 md:p-8">
      <h1 className="text-xl font-bold text-text mb-6">Memoire</h1>

      {/* Prompt input */}
      <div className="bg-card rounded-xl p-4 mb-6 border border-border">
        <label className="text-sm font-medium text-text-secondary mb-2 block">
          Instruction en langage naturel
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Retiens que mon comptable est M. Dupont, joignable au 06 12 34 56 78"
          rows={3}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handlePromptSubmit}
            disabled={promptLoading || !prompt.trim()}
            className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {promptLoading ? 'Envoi...' : 'Envoyer'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Memory list */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Fichiers</h2>
            <span className="text-xs px-2 py-0.5 rounded-md bg-text-tertiary/20 text-text-tertiary font-medium">
              {memoryIndex.length}
            </span>
          </div>

          {memoryLoading && memoryIndex.length === 0 ? (
            <p className="text-text-tertiary text-sm py-8 text-center">Chargement...</p>
          ) : memoryIndex.length === 0 ? (
            <p className="text-text-tertiary text-sm py-8 text-center">
              Aucun fichier memoire. Utilisez le champ ci-dessus pour en creer.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-tertiary text-xs border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Fichier</th>
                    <th className="pb-2 pr-4 font-medium">Categorie</th>
                    <th className="pb-2 pr-4 font-medium">Mis a jour</th>
                    <th className="pb-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {memoryIndex.map((entry: MemoryIndexEntry) => (
                    <tr
                      key={entry.filename}
                      onClick={() => selectMemory(entry.filename)}
                      className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-card-hover ${
                        selectedMemory?.filename === entry.filename ? 'bg-accent/10' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-mono text-text">{entry.filename}</td>
                      <td className="py-2.5 pr-4">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
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
                  Fermer
                </button>
              </div>

              <div className="flex gap-3 mb-3">
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary mb-1 block">Categorie</label>
                  <input
                    type="text"
                    value={editorCategory}
                    onChange={(e) => setEditorCategory(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary mb-1 block">Description</label>
                  <input
                    type="text"
                    value={editorDescription}
                    onChange={(e) => setEditorDescription(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <label className="text-xs text-text-tertiary mb-1 block">Contenu</label>
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                rows={12}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-mono resize-none focus:outline-none focus:border-accent"
              />

              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button
                  onClick={handleArchive}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg border border-border text-sm text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                >
                  Archiver
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
