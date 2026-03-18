# CLAUDE.md

## Project: Alfred

Assistant personnel autonome de Lolo (V2). Gère des dossiers administratifs via sessions Claude Code autonomes (`claude -p` child processes), avec garde-fous hooks et une app web.

**Repo:** `alfred` (clean break avec AI-assistant/V1)
**Spec complète:** `docs/design/alfred-spec.md`
**Plan d'implémentation:** `docs/plans/alfred-plan.md`
**Architecture V2:** `docs/design/v2-final.md`

## Platform

Tourne sur **macOS** (Mac Mini dédié, 24/7). Ce choix est intentionnel : macOS offre le plus de permissions et d'accès système parmi les OS grand public — AppleScript/osascript, Shortcuts, accès direct aux apps (Messages, Calendar, Contacts, Finder, etc.), controle d'accessibilite, et integration native avec l'ecosysteme Apple. Toujours privilegier les APIs et outils natifs macOS (osascript, `open`, Automator, Shortcuts CLI, `defaults`, `launchctl`) quand c'est possible.

## Language

Lolo communique en francais. Repondre en francais sauf pour le code/comments/commits (anglais).

## Commands

```bash
pnpm install                           # install all workspaces
pnpm build                             # build all packages
pnpm dev                               # dev mode (backend + web parallel)
pnpm test                              # vitest (backend)
pnpm test:e2e                          # playwright (web)
pnpm --filter @alfred/backend test     # backend tests only
pnpm --filter @alfred/web dev          # web dev only
pnpm --filter @alfred/shared build     # shared types only
```

### LaunchAgent (production)

```bash
launchctl load ~/Library/LaunchAgents/com.lolo.assistant.plist
launchctl unload ~/Library/LaunchAgents/com.lolo.assistant.plist
launchctl kickstart -k gui/$(id -u)/com.lolo.assistant   # restart
```

Logs: `~/Library/Logs/alfred.log` (app), `~/Library/Logs/alfred-stdout.log` / `alfred-stderr.log` (launchd).

## Architecture

### 8 principes directeurs

1. **La vitesse n'est pas un critere** — taches admin, pas du temps reel
2. **Claude Code est le moteur d'execution** — skills, MCP, browser, session resume
3. **Le budget n'est pas une contrainte** — Claude Max, pas de compromis tokens
4. **L'intelligence est dans Claude, pas dans le code** — le backend fait de la plomberie, Claude decide
5. **Pas d'interruption — parallelisme isole** — chaque dossier = sa propre session
6. **L'assistant tourne en fond, tranquillement** — hybride events + crons
7. **Actions rapides/interactives = outil specialise** — pas le systeme principal
8. **Amelioration continue** — gaps.md = backlog naturel

### Monorepo

```
alfred/
├── pnpm-workspace.yaml
├── packages/
│   └── shared/              # types TypeScript, Zod schemas
├── apps/
│   ├── backend/             # Hono API, daemon, launcher, receiver
│   └── web/                 # React SPA, Vite
├── workspace/               # runtime — dossiers, state.md, artifacts (gitignored)
└── docs/                    # design docs, specs, plans
```

### Composants backend

**Receiver** (`apps/backend/src/receiver/`):
- Webhooks (Gmail), watchers (SMS/WhatsApp), cron sweep, instructions Lolo
- Dedup par content hash
- Triage via `claude -p --system-prompt` (one-shot, JSON response)

**Launcher** (`apps/backend/src/launcher/`):
- Mode autonome (defaut) : lance `claude -p --output-format stream-json` comme child process Node.js. Process exit = signal fiable de fin de session.
- Mode interactif ("Prendre la main") : Lolo clique → backend kill le child process → lance `claude --resume <session-id>` dans tmux → interaction via ttyd. "Rendre la main" kill tmux et relance en autonome.
- Resume via `--resume <session-id>` (persiste dans `workspace/<dossier>/.session-id`)
- Post-session agent : s'execute automatiquement apres process exit dans `handleAutonomousExit()` — extraction memoire + gaps + verification journal
- Crash recovery au startup : reconcilie sessions tmux (interactives) + relance dossiers orphelins EN COURS (autonomes)
- Sweep periodique : `setInterval` + `claude -p` pour scan workspace

**Autonomous Executor** (`apps/backend/src/launcher/autonomous-executor.ts`):
- Spawn `claude -p --output-format stream-json --dangerously-skip-permissions` comme child process
- Parse le stdout NDJSON en temps reel (StreamEvent : assistant, tool_use, tool_result, result, system)
- Capture le session_id depuis l'event `result` pour future resume
- ProcessHandle : pid, kill(), onExit(), onOutput()

**Workspace** (`apps/backend/src/workspace/`):
- Fichiers markdown = etat des dossiers (state.md, checkpoint.md, artifacts/)
- Section optionnelle `## En attente` dans state.md = criteres de reprise (attente info externe)
  - Triage recoit le state.md complet pour matcher les events entrants
  - Checkup respecte la section (pas de relance sauf date depassee)
  - Launcher efface la section au relancement
- `_suggestions/` — dossiers suggeres par Claude, en attente d'approbation Lolo
- `_gaps/gaps.md` — lacunes detectees par Claude (backlog d'ameliorations)
- `_audit/actions.log` — trace de toutes les actions externes

**Infrastructure** (`apps/backend/src/infra/`):
- Locks PID par dossier (`/tmp/assistant-locks/`)
- Dedup store (content hash)
- Audit logger
- SSE emitter (event types : session:started/ended/idle/active/output/mode-changed, dossier:updated/completed, suggestion:created, checkpoint:created/resolved, amelioration:created)
- **SQLite (planifie)** : `better-sqlite3` dans `workspace/_data/alfred.db` — 4 tables (`claude_processes`, `notifications`, `dedup_hashes`, `sessions`) pour remplacer l'etat in-memory. Les fichiers (state.md, checkpoint.md, artifacts, memory) restent pour ce que Claude touche.

**Hooks handler** (`apps/backend/src/hooks/`):
- Endpoint unique `POST /api/hooks` — tous les hooks `type: "command"` appellent ca
- Route selon `hook_event_name` : PreToolUse/PostToolUse → audit, Notification/idle_prompt → timer (mode interactif seulement), SessionEnd/Stop → audit + SSE
- En mode autonome, le lifecycle est gere par process exit, pas par les hooks — les hooks sont audit-only pour Stop/SessionEnd

**Notifications** (`apps/backend/src/notifications/`):
- Telegram (grammy) — notifications checkpoints, completions, escalades
- Liens vers l'app web dans les messages

### CLAUDE.md 2 niveaux (contexte sessions)

**Niveau 1** — `workspace/CLAUDE.md` (global, ecrit une fois) :
- Identite, style, regles de securite, formats attendus, outils disponibles

**Niveau 2** — `workspace/<dossier>/CLAUDE.md` (genere par le backend a chaque lancement) :
- Objectif du dossier, mode confirm, event/instruction, contacts

### Garde-fous (hooks PreToolUse)

Hooks `type: "prompt"` — mini-Claude verificateur, cote SYSTEME, avant chaque outil sensible.
Claude ne les appelle pas, ne peut pas les skipper, ne sait meme pas qu'ils existent.
Fonctionnent en mode autonome (`claude -p`) comme en mode interactif (tmux).

**Matchers critiques:**
- `mcp__gmail__send|reply|draft` — verifie email (pas de paiement sans approbation)
- `mcp__camofox__click|fill_form|evaluate_js` — verifie clic/formulaire (DENY si paiement)
- `Bash` → `curl -X POST`, `ssh`, `scp` (3 matchers separes, substring match)

Hooks `type: "command"` — detection + audit (non-bloquant), notifie le backend. En mode autonome, les hooks Stop/SessionEnd sont audit-only — le lifecycle est gere par process exit.

### Data flow

```
Gmail webhook / SMS watcher / WhatsApp watcher / Telegram / App web
    → Receiver (dedup + triage Claude)
    → Launcher (claude -p child process, mode autonome)
    → Claude travaille (hooks PreToolUse verifient chaque action sensible)
    → state.md mis a jour / checkpoint.md si bloque / ## En attente si attente externe
    → Process exit → handleAutonomousExit() → cleanup lock, notification, post-session agent (memoire)
    → Optionnel : "Prendre la main" → kill process → tmux interactif → "Rendre la main" → relance autonome
    → Sweep periodique → verifie dossiers, lance sessions
```

### Sessions Claude

**Mode autonome (defaut)** — child process Node.js :
```bash
# Lancement autonome (child process, pas tmux)
claude -p --output-format stream-json --verbose --dangerously-skip-permissions \
  [--plugin-dir plugins/alfred-hooks] [--resume <session-id>] "<instruction>"
# Le process tourne dans le cwd du dossier (workspace/<dossier-id>/)
# stdout = NDJSON (stream events), exit = fin de session
```

**Mode interactif ("Prendre la main")** — tmux pour Lolo :
```bash
# Lance quand Lolo clique "Prendre la main" dans l'app web
tmux new-session -d -s alfred-<dossier-id> \
  "cd workspace/<dossier-id> && claude --dangerously-skip-permissions --resume <session-id>"
# Lolo interagit via ttyd (terminal dans l'app web)
# "Rendre la main" → kill tmux → relance en mode autonome
```

**Appels one-shot** (triage, sweep, memoire) :
```bash
# Triage
claude -p --system-prompt "Mode triage. Reponds en JSON." "Event: ..."

# Sweep
claude -p --system-prompt "Mode sweep." --allowedTools "Read,Glob,Grep,Write" "Lis workspace/*/state.md..."
```

**`--dangerously-skip-permissions`** sur toutes les sessions — la securite est assuree par les hooks PreToolUse, pas par le systeme de permissions integre.

### Browser : Camoufox

Chaque session a sa propre instance Camoufox avec profil isole. Pas Chrome/Playwright.
- Parallelisme total (plus de lock browser)
- Anti-detection
- Sessions persistantes par profil (cookies, login conserves)
- Lolo garde Chrome pour lui

## Frontend (App web)

**Tech:** React 19, Vite, React Router v7, Tailwind CSS v4 (CSS-first), Zustand, xterm.js

**Pages:**
- Home — dossiers actifs + suggestions + gaps
- Dossier detail — state.md, checkpoint, terminal (xterm.js → ttyd/tmux, mode interactif uniquement), artifacts
- Nouveau dossier — instruction + mode confirm
- Notifications — historique

**SSE** : EventSource natif → store Zustand en temps reel

**React 19** : Ne JAMAIS utiliser `useMemo`, `useCallback`, ou `React.memo` — React Compiler gere la memoization.

## Code Style

- **TypeScript strict** partout
- **Zod** pour validation (schemas dans `packages/shared`)
- **Factory functions** — pas de classes. Chaque module exporte `createX()` retournant une interface. Permet le mocking facile en tests.
- **SSOT** — jamais de duplication de types, constantes, ou etat
- **Progressive Logging** — `console.error`/`console.warn` avec contexte. `console.log` aux frontieres (API route entry, hook handler, Claude spawn). Prefix `[service]` (ex: `[launcher]`, `[receiver]`, `[triage]`). Pas de logs dans les boucles.
- **Timeouts Claude** — Tous les appels `claude -p` (triage, checkup, title gen, memory agents) doivent avoir un timeout de **1h minimum** (`3_600_000`). Claude peut etre lent sous charge (rate limits, queue). Le timeout est un garde-fou zombie, pas une contrainte de perf. Ne JAMAIS mettre un timeout court (30s, 60s) sur un appel Claude.

## Testing

**Vitest** pour le backend, **Playwright** pour le frontend E2E.

148 tests E2E definis dans `docs/design/e2e-tests.md` — tracabilite parfaite spec → plan → code → tests.

- Tests miroir `src/` structure sous `tests/`
- Factory function mocking (pas de DI framework)
- DB tests : fichiers workspace + SQLite (planifie) en tmpdir, tests utilisent des tmpdir
- **Chaque changement de code doit inclure les tests appropriés**

## Test Tasks Safety

Quand tu generes des taches de test pour Alfred (test tasks, debug, validation de features) :
- **JAMAIS d'actions irreversibles** : pas d'envoi de vrais emails a des tiers, pas de transactions, pas de posts publics
- **Emails uniquement a Lolo** : `l.denblyden@gmail.com` — jamais a des contacts reels (comptable, clients, admin)
- **Destinations fictives** : utiliser `example.com` pour les adresses email fictives
- **Navigation safe** : sites publics uniquement (Wikipedia, CoinGecko, Booking), pas de login sur des comptes sensibles
- Le projet est encore en developpement — toute tache de test doit etre sans risque si elle s'execute reellement

## Git

- Conventional commits: `type(scope): message`
- Ne jamais ajouter de `Co-Authored-By`
- Ne pas commit sauf si demande
- Ne pas push sauf si demande

## Secrets & Auth

- **Claude**: Claude Max subscription via OAuth — jamais d'API keys, jamais `ANTHROPIC_API_KEY`
- **Secrets**: Infisical (self-hosted at infisical.loaddr.com) ou Bitwarden/Vaultwarden via `bw` CLI
- **Telegram**: credentials dans le LaunchAgent plist environment
- **Jamais hardcoder de secrets** dans le code, .env committes, ou docker-compose

## Key Paths

- `apps/backend/src/` — source backend
- `apps/web/src/` — source frontend
- `packages/shared/src/` — types partages, Zod schemas
- `workspace/` — runtime data (dossiers, state.md, artifacts) — **gitignored**
- `workspace/CLAUDE.md` — prompt global niveau 1 (pas gitignored)
- `/tmp/assistant-locks/` — PID lock files runtime
- `docs/design/` — architecture, spec, reflexion V2
- `docs/plans/` — plan d'implementation

## Design Docs

| Document | Contenu |
|----------|---------|
| `docs/design/alfred-spec.md` | Spec complete consolidee (SSOT pour le plan) |
| `docs/design/v2-final.md` | Architecture V2, principes, benchmark tasks |
| `docs/design/implementation.md` | Decisions techniques, monorepo, infra |
| `docs/design/hooks-techniques.md` | Reference technique hooks Claude Code |
| `docs/design/e2e-tests.md` | 148 tests E2E structures |
| `docs/plans/alfred-plan.md` | Plan d'implementation (5 chunks, 28 tasks) |
| `docs/design/archive/` | Historique de reflexion (approches explorees, decisions ecartees) |
