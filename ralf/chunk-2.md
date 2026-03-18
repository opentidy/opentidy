# Chunk 2 — Backend Core : Infrastructure (locks, dedup, audit) + Workspace

## Contexte obligatoire — LIRE AVANT TOUTE ACTION

Avant de commencer l'implementation, tu DOIS lire et comprendre ces documents dans l'ordre :

1. `CLAUDE.md` — instructions projet, architecture, conventions, commandes
2. `docs/design/alfred-spec.md` — spec complete (vision, principes, composants, garde-fous, tests E2E)
3. `docs/design/v2-final.md` — architecture V2, decisions validees, benchmark tasks
4. `docs/design/implementation.md` — decisions techniques, monorepo, infrastructure
5. `docs/design/hooks-techniques.md` — reference technique hooks Claude Code
6. `docs/design/e2e-tests.md` — 148 tests E2E (IDs a couvrir dans ce chunk)
7. `docs/plans/alfred-plan.md` — plan d'implementation complet, section "Chunk 2" (lignes 631-1559)

Ces documents contiennent toutes les decisions d'architecture, les raisons derriere chaque choix, et les alternatives ecartees. Si tu te retrouves face a une decision non couverte par le plan, consulte d'abord la spec et le v2-final avant d'improviser.

## Execution

Utilise `superpowers:subagent-driven-development` pour executer les tasks. Un subagent frais par task, avec review spec compliance + code quality apres chaque task.

Suis le plan a la lettre — le code, les commandes, les tests sont tous ecrits dans `docs/plans/alfred-plan.md`.

### Tasks de ce chunk

- **Task 5** : Module locks — PID-based file locks (`/tmp/assistant-locks/`)
- **Task 6** : Module dedup — content hash (SHA-256, 24h expiry)
- **Task 7** : Module audit — trail logger (`_audit/actions.log`)
- **Task 8** : Module workspace — state manager (state.md parser, dossier CRUD, suggestions, gaps)

### IDs de tests E2E a couvrir

Locks : E2E-INF-01, -02, -03, EDGE-15, EDGE-18
Dedup : E2E-INF-05, -06, -07
Audit : E2E-INF-08, -09, EDGE-19
Workspace : E2E-WS-01 a -07, EDGE-04, -14, -16, SUG-01 a -05, AML-01 a -04

### Contraintes techniques

- **Factory functions** — `createLockManager()`, `createDedupStore()`, `createAuditLogger()`, `createDossierManager()`, `createSuggestionsManager()`, `createGapsManager()`
- **Pas de DB** — fichiers workspace/ pour l'etat, fichiers lock dans /tmp/
- **Tests vitest** — utiliser `fs.mkdtempSync` pour tmpdir isolees, pas de mocks filesystem
- **cleanupStaleLocks()** — verifie que le PID est encore vivant, sinon supprime le lock
- **parseStateMd()** et **parseCheckpointMd()** — parsers robustes, tolerants aux edits manuels de Lolo
- **Suggestions cap a 20** — trier par urgence (urgent > normal > faible)
- **Conventional commits** par task

### Verification post-chunk

```bash
pnpm --filter @alfred/backend test     # tous les tests passent (locks, dedup, audit, workspace)
pnpm --filter @alfred/backend build    # compile
```
