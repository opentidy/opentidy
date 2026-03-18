## Task

# Chunk 5 — Tests Playwright + Edge cases + Smoke + Infrastructure

(Backup copy — authoritative version is in ralph-loop.local.md)

## Contexte obligatoire — LIRE AVANT TOUTE ACTION

Avant de commencer l'implementation, tu DOIS lire et comprendre ces documents dans l'ordre :

1. `CLAUDE.md` — instructions projet, architecture, conventions, commandes
2. `docs/design/opentidy-spec.md` — spec complete, en particulier :
   - Section 18 (Tests E2E) — tous les 148 tests avec descriptions
   - Section 9 (Infrastructure) — setup.sh, LaunchAgent, permissions macOS
   - Section 5.4 (Garde-fous) — config hooks JSON exacte
3. `docs/design/e2e-tests.md` — structure complete des tests, mocks, niveaux
4. `docs/design/hooks-techniques.md` — reference technique pour la config hooks (Task 28)
5. `docs/plans/opentidy-plan.md` — section "Chunk 5" (lignes 3155-fin)

## Execution

Utilise `superpowers:subagent-driven-development` pour executer les tasks. Un subagent frais par task, avec review spec compliance + code quality apres chaque task.

### Tasks de ce chunk

- **Task 25** : Tests Playwright — 28 tests E2E dans 10 fichiers spec
- **Task 26** : Tests edge cases backend — 5 tests specifiques
- **Task 27** : Smoke tests — commandes /test manuelles (3 scenarios full-stack)
- **Task 28** : Infrastructure — setup.sh, LaunchAgent plist, config hooks JSON, Dockerfile frontend
