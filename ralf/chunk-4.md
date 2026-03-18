# Chunk 4 — Frontend : App web complete

## Contexte obligatoire — LIRE AVANT TOUTE ACTION

Avant de commencer l'implementation, tu DOIS lire et comprendre ces documents dans l'ordre :

1. `CLAUDE.md` — instructions projet, architecture, conventions, commandes
2. `docs/design/alfred-spec.md` — spec complete, en particulier :
   - Section 6 (App web) — pages, composants, UX, PWA, responsive
   - Section 5.4 (Garde-fous) — comment l'app web affiche les actions en attente de validation
   - Section 7 (Intervention humaine) — comment Lolo interagit via le terminal web
3. `docs/design/v2-final.md` — section UI/UX
4. `docs/design/e2e-tests.md` — tests section APP (E2E-APP-01 a -28)
5. `docs/plans/alfred-plan.md` — section "Chunk 4" (lignes 2761-3154)

### MOCKUPS — REFERENCE VISUELLE OBLIGATOIRE

**CRITIQUE** : Avant d'implementer chaque page, tu DOIS regarder les mockups dans `docs/design/mockups/`. Le design DOIT correspondre aux mockups. Ce ne sont pas des suggestions — c'est le design valide par Lolo.

- `docs/design/mockups/DESIGN-GUIDE.md` — **LIRE EN PREMIER** — guide complet (theme, couleurs, composants, patterns, layout par page)
- `docs/design/mockups/final-v2.html` — mockup HTML interactif (ouvrir dans un browser si possible)
- `docs/design/mockups/alfred-mockup-home-actions.png` — Home avec actions (desktop + mobile)
- `docs/design/mockups/alfred-mockup-dossiers.png` — Liste dossiers (desktop + mobile)
- `docs/design/mockups/alfred-mockup-dossier-detail.png` — Detail dossier (desktop + mobile)
- `docs/design/mockups/alfred-mockup-terminal.png` — Terminal tmux (desktop + mobile)
- `docs/design/mockups/alfred-mockup-nouveau.png` — Nouveau dossier (desktop + mobile)
- `docs/design/mockups/alfred-mockup-ameliorations.png` — Ameliorations (desktop + mobile)

Chaque screenshot montre la version desktop (en haut) ET la version mobile (en bas). Le design est dark mode uniquement, theme sombre bleu/noir.

## Execution

Utilise `superpowers:subagent-driven-development` pour executer les tasks. Un subagent frais par task, avec review spec compliance + code quality apres chaque task.

Les tasks frontend sont plus flexibles que le backend — le plan donne la structure mais pas tout le JSX. L'implementeur DOIT se referer aux mockups (screenshots + DESIGN-GUIDE.md) pour les couleurs, le layout, et le style de chaque composant.

### Tasks de ce chunk

- **Task 16** : Store Zustand + API client + SSE listener
- **Task 17** : Layout responsive — desktop icon rail + mobile tab bar
- **Task 18** : Page Home — dossiers actifs, suggestions, gaps
- **Task 19** : Page Dossiers — liste complete avec filtres
- **Task 20** : Page Dossier detail — state.md, checkpoint, terminal, artifacts
- **Task 21** : Page Terminal — xterm.js + tmux bridge WebSocket (la partie la plus technique)
- **Task 22** : Page Nouveau — creer un dossier avec instruction + mode confirm
- **Task 23** : Page Ameliorations — gaps detectees par Claude
- **Task 24** : Navigation et PWA (manifest, service worker, icons)

### IDs de tests E2E a couvrir

E2E-APP-01 a -28 (tests Playwright dans le chunk 5, mais les composants doivent etre fonctionnels)

### Contraintes techniques

- **React 19** — JAMAIS `useMemo`, `useCallback`, `React.memo`
- **Tailwind v4** CSS-first — `@import "tailwindcss"`, pas de tailwind.config.js
- **Zustand** — un seul store, actions async, SSE listener avec `connectSSE()`
- **xterm.js** + **@xterm/addon-fit** + **@xterm/addon-attach** — WebSocket vers le backend qui pipe tmux
- **API client** : 18 fonctions, types `@alfred/shared`, `fetch` natif
- **SSE** : `EventSource` natif, mapping event type → store refresh (pas de refetch apres mutation si SSE actif)
- **Responsive** : desktop = icon rail a gauche, mobile = tab bar en bas
- **PWA** : manifest.json + service worker basique (cache-first pour assets)

### Verification post-chunk

```bash
pnpm --filter @alfred/web build        # compile le frontend
pnpm --filter @alfred/backend build    # backend toujours OK
pnpm --filter @alfred/backend test     # pas de regression backend
# Verifier visuellement :
pnpm dev                               # lance backend + frontend
# Naviguer sur http://localhost:5173 — toutes les pages doivent s'afficher
```
