import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import SuggestionCard from '../components/SuggestionCard';

export default function Nouveau() {
  const navigate = useNavigate();
  const { suggestions, fetchSuggestions, createDossier } = useStore();
  const [instruction, setInstruction] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  async function handleLaunch() {
    if (!instruction.trim() || launching) return;
    setLaunching(true);
    try {
      await createDossier(instruction, confirm);
      navigate('/');
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-text mb-1">Nouveau dossier</h1>
      <p className="text-text-secondary text-sm mb-6">Decris ce que tu veux. L'assistant cree le dossier et commence.</p>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Ex: Mets le bureau en vente sur 2ememain, prix 300&euro;..."
        className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-tertiary outline-none focus:border-accent resize-none h-40"
      />

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-text-tertiary hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            Fichiers
          </button>
          <label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="rounded border-border" />
            Valider avant actions externes
          </label>
        </div>
        <button
          onClick={handleLaunch}
          disabled={!instruction.trim() || launching}
          className="px-5 py-2 rounded-lg bg-green text-white text-sm font-medium hover:bg-green/90 disabled:opacity-50 transition-colors"
        >
          Lancer
        </button>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rotate-45 bg-accent" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Recommandations de l'assistant
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
