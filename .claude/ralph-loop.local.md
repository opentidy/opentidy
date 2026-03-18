---
active: true
iteration: 1
session_id: ralf-chunk5-20260314
max_iterations: 40
completion_promise: "RALF COMPLETE"
started_at: "2026-03-14T22:06:09Z"
---

## Task

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

## Checklist — READ AND UPDATE BEFORE EVERY EXIT ATTEMPT

There is a checklist file at `.claude/ralf-checklist.md`. You MUST:
1. READ this file at the START of every iteration
2. UPDATE it (check the box with [x]) IMMEDIATELY after completing each step
3. VERIFY all boxes are checked before outputting the completion promise

If any box is still unchecked [ ], you are NOT done. Keep working.

## Testing Contract — MANDATORY

You MUST complete ALL of the following steps IN ORDER. After completing each step, immediately update the checklist file.

### Step 1: Implement the task
Complete the task described above. Write clean, well-structured code following the project conventions in CLAUDE.md.
WHEN DONE: Update `.claude/ralf-checklist.md` — check STEP 1.

### Step 2: Write unit tests
Write comprehensive unit tests for all new/modified code. Tests go in `tests/` mirroring the `src/` structure. Use vitest with factory-function mocking. Cover:
- Happy path
- Edge cases
- Error handling
WHEN DONE: Update `.claude/ralf-checklist.md` — check STEP 2.

### Step 3: Run ALL unit tests
Run: pnpm test
ALL tests must pass — both new tests AND existing tests. Zero failures. Zero regressions.
WHEN DONE (0 failures): Update `.claude/ralf-checklist.md` — check STEP 3.

### Step 4: Run E2E tests (if applicable)
If your changes affect the dashboard, API, or any user-facing flow, run ALL end-to-end tests:
Run: pnpm --filter @alfred/web test:e2e
If no E2E tests exist for the affected flow, write them.
WHEN DONE: Update `.claude/ralf-checklist.md` — check STEP 4.

### Step 5: Final unit test verification
Run the FULL test suite one last time to confirm everything passes:
Run: pnpm test
WHEN DONE (0 failures): Update `.claude/ralf-checklist.md` — check STEP 5.

### Step 6: Build verification
Run: pnpm build
Must succeed with no errors.
WHEN DONE: Update `.claude/ralf-checklist.md` — check STEP 6.

### Step 7: MANDATORY — Run /test end-to-end tests via Playwright
THIS STEP IS NOT OPTIONAL. YOU MUST DO IT BEFORE COMPLETING.

After all unit tests pass, you MUST invoke the /test skill to run real end-to-end tests against the running application via Playwright. This tests the ACTUAL UI and API, not just unit-level code.

1. Describe what you implemented as a test prompt for /test
2. Invoke /test with that prompt — it will launch Playwright, navigate the app, and verify the feature works end-to-end
3. If /test finds issues, fix them ALL before proceeding
4. If /test reports PASSED, you may proceed

WHEN DONE (report shows PASSED): Update `.claude/ralf-checklist.md` — check STEP 7.

DO NOT SKIP THIS STEP. DO NOT OUTPUT THE COMPLETION PROMISE WITHOUT RUNNING /test.

### Pre-completion verification
BEFORE outputting the completion promise, you MUST:
1. Read `.claude/ralf-checklist.md`
2. Verify EVERY box shows [x] — ALL 7 steps
3. If ANY box shows [ ], go back and complete that step
4. ONLY if all 7 boxes are [x], output the promise

### Completion criteria
You may ONLY output the completion promise when ALL boxes in `.claude/ralf-checklist.md` are checked [x]. Read the file and verify. If any box is unchecked, you are NOT done.

If ANY test fails or /test reports issues, UNCHECK the relevant box, fix the issue, and re-run. Do NOT output the promise until EVERYTHING passes.
