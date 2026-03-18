# Chunk 1 — Foundation : Monorepo, shared types, backend skeleton, frontend skeleton

## Contexte obligatoire — LIRE AVANT TOUTE ACTION

Avant de commencer l'implementation, tu DOIS lire et comprendre ces documents dans l'ordre :

1. `CLAUDE.md` — instructions projet, architecture, conventions, commandes
2. `docs/design/alfred-spec.md` — spec complete (vision, principes, composants, garde-fous, tests E2E)
3. `docs/design/v2-final.md` — architecture V2, decisions validees, benchmark tasks
4. `docs/design/implementation.md` — decisions techniques, monorepo, infrastructure
5. `docs/plans/alfred-plan.md` — plan d'implementation complet (28 tasks, 5 chunks)

Ces documents contiennent toutes les decisions d'architecture, les raisons derriere chaque choix, et les alternatives ecartees. Si tu te retrouves face a une decision non couverte par le plan, consulte d'abord la spec et le v2-final avant d'improviser.

**IMPORTANT** : Le repo a deja un CLAUDE.md et des docs. Tu travailles DANS le repo existant, pas dans un sous-dossier `alfred/`. Les paths du plan comme `alfred/packages/shared/` signifient que tu crees `packages/shared/` a la racine du repo.

## Execution

Utilise `superpowers:subagent-driven-development` pour executer les tasks. Un subagent frais par task, avec review spec compliance + code quality apres chaque task.

Suis le plan a la lettre — le code, les commandes, les tests sont tous ecrits dans `docs/plans/alfred-plan.md`, section "Chunk 1" (lignes 15-630).

### Tasks de ce chunk

- **Task 1** : Initialiser le monorepo pnpm (package.json, pnpm-workspace.yaml, tsconfig.base, .prettierrc, eslint.config, .gitignore)
- **Task 2** : Package shared — types et schemas Zod (@alfred/shared)
- **Task 3** : Backend skeleton — Hono server + health check (@alfred/backend)
- **Task 4** : Frontend skeleton — React 19, Vite, Tailwind v4, React Router (@alfred/web)

### Contraintes techniques (extraites de la spec)

- **pnpm** obligatoire (pas npm, pas yarn) — `"preinstall": "npx only-allow pnpm"`
- **TypeScript strict** partout
- **Zod** dans packages/shared pour les schemas (SSOT — pas de duplication de types)
- **Tailwind v4** CSS-first : `@import "tailwindcss"` dans index.css, plugin `@tailwindcss/vite`, PAS de tailwind.config.js ni postcss.config.js
- **React Router v7** : import depuis `react-router-dom` (pas `react-router`)
- **React 19** : jamais `useMemo`, `useCallback`, `React.memo` (React Compiler)
- **Factory functions** — pas de classes
- **Conventional commits** : `type(scope): message`
- **Pas de Co-Authored-By** dans les commits

### Verification post-chunk

Apres toutes les tasks :
```bash
pnpm install                           # doit reussir
pnpm --filter @alfred/shared build     # doit compiler les types
pnpm --filter @alfred/backend build    # doit compiler le backend
pnpm --filter @alfred/web build        # doit compiler le frontend
curl http://localhost:3001/api/health   # doit retourner {"status":"ok"}
```
