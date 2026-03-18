# Chunk 5 — Tests Playwright + Edge cases + Smoke + Infrastructure

## Contexte obligatoire — LIRE AVANT TOUTE ACTION

Avant de commencer l'implementation, tu DOIS lire et comprendre ces documents dans l'ordre :

1. `CLAUDE.md` — instructions projet, architecture, conventions, commandes
2. `docs/design/alfred-spec.md` — spec complete, en particulier :
   - Section 18 (Tests E2E) — tous les 148 tests avec descriptions
   - Section 9 (Infrastructure) — setup.sh, LaunchAgent, permissions macOS
   - Section 5.4 (Garde-fous) — config hooks JSON exacte
3. `docs/design/e2e-tests.md` — structure complete des tests, mocks, niveaux
4. `docs/design/hooks-techniques.md` — reference technique pour la config hooks (Task 28)
5. `docs/plans/alfred-plan.md` — section "Chunk 5" (lignes 3155-fin)

## Execution

Utilise `superpowers:subagent-driven-development` pour executer les tasks. Un subagent frais par task, avec review spec compliance + code quality apres chaque task.

### Tasks de ce chunk

- **Task 25** : Tests Playwright — 28 tests E2E dans 10 fichiers spec (home, dossier-detail, dossier-list, nouveau, terminal, ameliorations, suggestions, notifications, navigation, empty-state)
- **Task 26** : Tests edge cases backend — 5 tests specifiques (checkpoints multiples, webhook flood 100 emails, state.md manual edit, Camoufox profil corrompu, erreur disque)
- **Task 27** : Smoke tests — commandes `/test` manuelles (3 scenarios full-stack)
- **Task 28** : Infrastructure — setup.sh, LaunchAgent plist, config hooks JSON, Dockerfile frontend

### IDs de tests E2E a couvrir

Playwright : E2E-APP-01 a -28
Edge : E2E-EDGE-05, -07, -08, -12, -17
Full : E2E-FULL-01 a -07 (smoke tests)

### Contraintes techniques

- **Playwright** : `@playwright/test`, base URL `http://localhost:5173`, backend doit tourner
- **Edge cases** : tests vitest, pas Playwright. Utilisent tmpdir + mocks cibles
- **Smoke tests** : ce sont des commandes `/test` documentees, pas des scripts automatises
- **setup.sh** : deux parties — automatisee (Homebrew, Node, pnpm, Claude CLI, tmux, Camoufox, cloudflared) + guidee (permissions macOS avec System Settings)
- **Hooks config** : `input_contains` fait du **substring match** (pas regex !). Les matchers Bash doivent etre separes : `curl -X POST`, `ssh `, `scp ` (3 entrees distinctes)
- **LaunchAgent** : `com.lolo.assistant.plist`, variables d'environnement pour Telegram, WORKSPACE_DIR
- **Dockerfile** : multi-stage build Vite → nginx pour le frontend

### Verification post-chunk (FINALE)

```bash
# TOUT doit passer :
pnpm --filter @alfred/shared build     # types OK
pnpm --filter @alfred/backend build    # backend OK
pnpm --filter @alfred/backend test     # unit + edge case tests OK
pnpm --filter @alfred/web build        # frontend OK

# Demarrer et tester :
pnpm dev &
pnpm --filter @alfred/web test:e2e     # Playwright E2E tests

# Verifier l'infrastructure :
test -f setup.sh && echo "setup.sh present"
test -f com.lolo.assistant.plist && echo "LaunchAgent present"
test -f .claude/settings.json && echo "hooks config present"
```
