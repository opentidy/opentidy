import { useStore } from '../store';

export default function ErrorBanner() {
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);

  if (!error) return null;

  return (
    <div className="bg-red-900/80 text-red-100 px-4 py-2 text-sm flex items-center justify-between gap-4">
      <span>Erreur : {error}</span>
      <button onClick={clearError} className="text-red-300 hover:text-white shrink-0">
        Fermer
      </button>
    </div>
  );
}
