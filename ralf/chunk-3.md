# Chunk 3 — Backend Core : Launcher, Receiver, Hooks, Notifications, SSE, API, Entrypoint

## Contexte obligatoire — LIRE AVANT TOUTE ACTION

Avant de commencer l'implementation, tu DOIS lire et comprendre ces documents dans l'ordre :

1. `CLAUDE.md` — instructions projet, architecture, conventions, commandes
2. `docs/design/alfred-spec.md` — spec complete, en particulier :
   - Section 5.1 (Receiver) — format events, triage Claude, JSON response
   - Section 5.3 (Launcher) — CLAUDE.md 2 niveaux, tmux, idle/timeout flow
   - Section 5.4 (Garde-fous) — hooks PreToolUse, type "prompt" vs "command"
   - Section 7 (Intervention humaine) — idle timer, crash recovery, resume
   - Section 8 (Cron sweep) — `claude -p --system-prompt`
3. `docs/design/v2-final.md` — architecture V2, principes (surtout #4 : intelligence dans Claude, pas dans le code)
4. `docs/design/implementation.md` — decisions techniques
5. `docs/design/hooks-techniques.md` — reference technique hooks (JSON input/output, matchers, timeout)
6. `docs/design/e2e-tests.md` — tests E2E section 9 (SESSION LIFECYCLE), 10 (CRON SWEEP), etc.
7. `docs/plans/alfred-plan.md` — section "Chunk 3" (lignes 1560-2760)

**DECISIONS D'ARCHITECTURE CRITIQUES** (lire la spec si un doute) :

- **Triage** : `claude -p --system-prompt` par event, backend pre-collecte la liste des dossiers, reponse JSON (`dossierIds` | `suggestion` | `ignore`), fallback si echec
- **Launcher** : tmux sessions, CLAUDE.md 2 niveaux, `--dangerously-skip-permissions`, resume via `.session-id`
- **Idle/timeout** : hook `idle_prompt` → timer 1h → `tmux send-keys "Timeout..."` → Claude sauvegarde et quitte. Annulation du timer : prochain hook (PreToolUse/Stop/PostToolUse) de la session idle → `cancelIdleTimer()` + statut → `active`. Fonction `handleHookEvent()`.
- **Crash recovery** : au startup, `tmux list-sessions` → reconcilie la Map, `cleanupStaleLocks()`, tout marque `active` (idle_prompt se redeclenchera naturellement)
- **Sweep** : `claude -p --system-prompt "..." --allowedTools "Read,Glob,Grep,Write"`, JSON response `{ launch: [...], suggestions: [...] }`
- **Hooks handler** : endpoint unique POST /api/hooks, route selon hook_event_name. Si session idle et hook arrive → cancel timer.
- **Browser** : Camoufox (pas Chrome/Playwright), profil isole par session

## Execution

Utilise `superpowers:subagent-driven-development` pour executer les tasks. Un subagent frais par task, avec review spec compliance + code quality apres chaque task.

C'est le chunk le plus gros et le plus critique. Certaines tasks (11, 12, 14) sont sous-specifiees dans le plan — les descriptions sont la mais le code n'est pas complet. L'implementeur doit se referer a la spec et aux patterns des tasks precedentes pour combler les gaps.

### Tasks de ce chunk

- **Task 9** : Module launcher — sessions tmux + Claude (session.ts, sweep.ts, tmux-executor.ts). C'est la task la plus complexe — tests complets fournis.
- **Task 10** : Module receiver — webhooks Gmail, watchers SMS/WhatsApp, triage
- **Task 11** : Module hooks — endpoint centralise `/api/hooks` (handler routing, audit, idle detection)
- **Task 12** : Module notifications — Telegram via grammy (checkpoints, completions, escalades)
- **Task 13** : Module SSE — events temps reel (EventEmitter → ReadableStream)
- **Task 14** : Assembler les routes API (18 endpoints Hono)
- **Task 15** : Tmux executor + Entrypoint backend — wiring + sweep + boot

### IDs de tests E2E a couvrir

Session/Launcher : E2E-LCH-01 a -11, E2E-SLC-01 a -08
Sweep : E2E-CRN-01 a -06
Receiver : E2E-RCV-01 a -08
Hooks : E2E-GF-01 a -18, EDGE-11
Notifications : E2E-NTF-01 a -09
SSE : E2E-APP-22
Edge : EDGE-01, -03, -06, -09

### Contraintes techniques

- **SessionExecutor** = interface mockable pour tmux (`launchTmux`, `sendKeys`, `capturePane`, `killSession`, `listSessions`)
- **`execFile`** (pas `exec`) pour tmux et claude — securite
- **Fake timers vitest** pour les tests idle/timeout
- **grammy** pour Telegram — `createNotifier()` avec retry 3 tentatives + backoff
- **SSE** : pas de librairie, `ReadableStream` natif + `TextEncoderStream`
- **Hono** routes : chaque route file dans son propre fichier, `createApp(deps)` assemble

### Verification post-chunk

```bash
pnpm --filter @alfred/backend test     # tous les tests passent
pnpm --filter @alfred/backend build    # compile
# Le backend doit demarrer et etre fonctionnel :
WORKSPACE_DIR=/tmp/alfred-test pnpm --filter @alfred/backend dev
curl http://localhost:3001/api/health   # {"status":"ok"}
curl http://localhost:3001/api/dossiers # [] (vide)
```
