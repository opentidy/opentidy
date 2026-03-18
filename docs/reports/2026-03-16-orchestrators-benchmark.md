# Benchmark des orchestrateurs d'agents IA — Mars 2026

> Analyse comparative de 12 projets open-source par rapport a Alfred.
> Genere le 2026-03-16.

---

## Table des matieres

1. [Vue d'ensemble](#vue-densemble)
2. [Fiches projet](#fiches-projet)
3. [Matrice comparative](#matrice-comparative)
4. [Patterns innovants a reprendre](#patterns-innovants-a-reprendre)
5. [Ce qu'Alfred fait mieux](#ce-qualfred-fait-mieux)
6. [Ce qu'Alfred ne sait pas faire](#ce-qualfred-ne-sait-pas-faire)
7. [Recommandations prioritaires](#recommandations-prioritaires)

---

## Vue d'ensemble

| # | Projet | Stars | Langage | Metaphore | Lien |
|---|--------|-------|---------|-----------|------|
| 1 | **Paperclip** | ~24k | TypeScript | AI company control plane | [github](https://github.com/paperclipai/paperclip) |
| 2 | **OpenClaw** | ~247k | TypeScript | Personal AI gateway multi-canal | [github](https://github.com/openclaw/openclaw) |
| 3 | **Claude Squad** | ~6.3k | Go | TUI multi-agent tmux manager | [github](https://github.com/smtg-ai/claude-squad) |
| 4 | **Ruflo** (claude-flow) | ~21k | TypeScript | Swarm orchestration + vector memory | [github](https://github.com/ruvnet/ruflo) |
| 5 | **Composio AO** | ~3.1k | TypeScript | PR lifecycle automation | [github](https://github.com/ComposioHQ/agent-orchestrator) |
| 6 | **amux** | ~1k+ | Python | Claude Code multiplexer + watchdog | [github](https://github.com/mixpeek/amux) |
| 7 | **OpenHands** | ~68k | Python | Autonomous coding agent platform | [github](https://github.com/OpenHands/OpenHands) |
| 8 | **CCManager** | ~811 | TypeScript | Multi-agent PTY session manager | [github](https://github.com/kbwo/ccmanager) |
| 9 | **CCSwarm** | ~500+ | Rust | Multi-agent coding system (partial) | [github](https://github.com/nwiizo/ccswarm) |
| 10 | **claude-session-driver** | ~200+ | Bash | Plugin Claude Code delegation | [github](https://github.com/obra/claude-session-driver) |
| 11 | **1code** | ~1k+ | TypeScript/Electron | GUI Cursor-like pour agents | [github](https://github.com/21st-dev/1code) |
| 12 | **Codeman** | ~206 | TypeScript | WebUI + respawn controller | [github](https://github.com/Ark0N/Codeman) |
| 13 | **Agent Farm** | ~500+ | Python | Parallel batch codebase improvement | [github](https://github.com/Dicklesworthstone/claude_code_agent_farm) |

---

## Fiches projet

### 1. Paperclip

**Concept** : Control plane pour "entreprises d'agents IA". Org chart, budgets, approbations, heartbeat model.

**Architecture** : Express + React, PostgreSQL (Drizzle, PGlite pour dev local), WebSocket temps reel, adapters par agent (claude-local, codex-local, cursor, gemini, openclaw-gateway, opencode, pi).

**Patterns cles** :
- **Heartbeat model** : agents ne tournent pas en continu, ils se reveillent par intervalles, assignments, ou on-demand
- **Session compaction policy** : rotation auto quand `maxSessionRuns` / `maxRawInputTokens` / `maxSessionAgeHours` depasse un seuil, avec handoff markdown
- **Atomic checkout** : `checkoutRunId` + 409 Conflict empechent deux agents de travailler sur le meme issue
- **Approval records** : pause agent → humain decide dans l'UI → agent reprend avec `APPROVAL_STATUS`
- **Budget hard-stop** : `spentMonthlyCents >= budgetMonthlyCents` → auto-pause
- **Config revision tracking** : chaque modif = snapshot before/after, rollback possible
- **Plugin system** : VM-sandboxed workers, manifest + capabilities, cron jobs, UI injection

---

### 2. OpenClaw

**Concept** : Gateway IA personnelle multi-canal. 20+ adaptateurs messaging (WhatsApp, Telegram, Discord, Signal, iMessage, SMS, IRC, Matrix, Teams, Slack...). 247k stars.

**Architecture** : Node.js daemon unique, WebSocket control plane, pi-mono embedded (pas Claude Code), Playwright/CDP pour browser, SQLite + HNSW pour memoire vectorielle.

**Patterns cles** :
- **Pre-compaction memory flush** : tour agent silencieux AUTOMATIQUE quand le contexte approche la limite, pousse le modele a persister ses notes avant compaction. Elimine la perte d'information
- **Temporal decay + MMR** pour memory retrieval : boost de recence (decay exponentiel par date) + maximal marginal relevance (evite les snippets redondants)
- **Binding system multi-agent** : routage declaratif 8 niveaux (peer > parentPeer > guildId+roles > guildId > teamId > accountId > channel > default). Un daemon = N agents isoles
- **Sub-agent announce chain** : taches background rapportent dans le thread de chat originel
- **Context steering mid-run** : `queue mode: "steer"` injecte des messages dans la run en cours apres chaque tool call
- **ACP integration** : spawn Claude Code, Codex, OpenCode, Gemini CLI via Agent Client Protocol, bindes a des threads Discord/Telegram
- **Companion nodes** (iOS/Android) : expose camera, location, notifications, contacts, calendar comme tools

---

### 3. Claude Squad

**Concept** : TUI Go pour gerer plusieurs agents terminal (Claude Code, Codex, Aider) dans des sessions tmux isolees avec git worktrees.

**Architecture** : Go + Bubbletea/Lipgloss (TUI), PTY via creack/pty, tmux, JSON persistence.

**Patterns cles** :
- **PTY handle permanent** : au lieu de `tmux send-keys`, ouvre un PTY sur `tmux attach-session` et ecrit directement dedans. Plus rapide, pas de problemes d'echappement
- **SHA256 change detection** : hash du contenu `capture-pane` toutes les 500ms pour detecter l'activite
- **Git worktree lifecycle** : create (snapshot HEAD) → pause (commit auto + remove worktree) → resume (re-add worktree) → kill (remove + delete branch)
- **Diff live** : `git add -N . && git diff <baseCommitSHA>` mis a jour toutes les 500ms
- **Trust prompt auto-dismiss** : scraping du terminal pour "Do you trust..." → auto-Enter
- **Terminal pane separee** : shell dans le worktree sans interferer avec Claude
- **Daemon AutoYes** : meme binaire en mode daemon, auto-accept toutes les 1000ms

---

### 4. Ruflo (claude-flow)

**Concept** : Framework d'orchestration massive — swarms multi-agents, memoire vectorielle HNSW, self-learning, 175+ MCP tools. Tres ambitieux.

**Architecture** : pnpm monorepo (18+ packages), MCP server, AgentDB/SQLite, ONNX embeddings local, WASM kernel.

**Patterns cles** :
- **ReasoningBank** : RAG sur les patterns passes. Avant chaque tache, recherche semantique des patterns similaires qui ont fonctionne. Apres succes, stocke le pattern. Quality scores avec usage count et success rate
- **MemoryGraph** : graphe de connaissances construit depuis les entries memoire. PageRank + community detection pour scorer l'importance structurelle
- **AutoMemoryBridge** : sync bidirectionnelle entre MEMORY.md (humain-lisible, charge dans le system prompt Claude) et le vector store
- **ContinueGate** : gate entre les etapes de raisonnement (pas les tool calls). Detecte : steps sans checkpoint, acceleration budget, degradation coherence, ratio rework. Decisions : continue/checkpoint/throttle/pause/stop
- **3-tier model routing** : WASM (<1ms, $0) pour transforms deterministes, Haiku/Sonnet pour medium, Opus pour complexe
- **Proof Envelope** : hash-chained, HMAC-signed audit trail par run
- **Meta-Governance** : regles de gouvernance protegees contre l'auto-modification (amendment = supermajority)
- **Consensus protocols** : Raft, PBFT, Gossip, CRDT pour resolution de conflits multi-agents
- **Claims system** : claim/release/steal/handoff avec rebalancing

---

### 5. Composio Agent Orchestrator

**Concept** : Orchestrateur de coding agents avec cycle de vie PR complet. CI failure → review comments → merge, tout automatise.

**Architecture** : Node.js/TypeScript monorepo, Next.js dashboard, 8 slots pluggables (runtime, agent, workspace, tracker, SCM, notifier, terminal, lifecycle).

**Patterns cles** :
- **Full PR lifecycle automation** : poll GitHub toutes les 30s pour CI status, review decision, mergeability. Auto-route CI logs et review comments vers l'agent responsible
- **LLM task decomposer** : `--decompose` classifie recursivement (max depth 3) atomic vs composite, spawn les sous-taches en parallele avec lineage + siblings context
- **Orchestrator-as-agent** : un Claude en mode "meta" qui a acces a toutes les commandes `ao` mais est interdit de coder — il coordonne
- **Global pause** : stoppe tout le lifecycle polling pendant qu'un humain review
- **PR takeover** : `ao session claim-pr 123` — reprend une PR existante dans une nouvelle session
- **Activity detection via JSONL/SQLite** : lit les fichiers de session natifs de l'agent (pas de PTY scraping) pour idle/busy/waiting/blocked
- **Agent hooks** : ecrit `.claude/settings.json` dans chaque worktree avec un PostToolUse hook qui auto-update les metadata session quand l'agent cree une PR
- **Hash-based namespace** : SHA-256 du config dir → prefixe 12 chars pour les sessions tmux, evite les collisions multi-checkout
- **Feedback loop** : agents peuvent soumettre `bug_report` ou `improvement_suggestion` qui deviennent des issues GitHub

---

### 6. amux

**Concept** : Multiplexeur Claude Code, fichier Python unique (~24k lignes), zero dependances. Watchdog auto-reparateur, kanban SQLite, orchestration agent-to-agent.

**Architecture** : Python stdlib uniquement (sqlite3, threading, subprocess, http.server, ssl). Dashboard HTML inline. Hot-reload via `os.execv`.

**Patterns cles** :
- **Watchdog auto-repair** (le plus precieux) :
  - `context left < 20%` → envoie `/compact` + backup JSONL + auto-continue post-compact
  - `redacted_thinking cannot be modified` → stop, efface session, restart, **rejoue le dernier message user** (extrait du JSONL)
  - Session `waiting` depuis 2 snapshots + auto-continue → auto-repond selon le type de prompt
  - Shell prompt visible sans Claude UI → auto-restart (context-limit exit)
- **Kanban SQLite avec claiming atomique** : `UPDATE SET next_n = next_n + 1 WHERE prefix = ? RETURNING next_n - 1` — zero race condition
- **Orchestration via prompt** : MEMORY.md global injecte dans chaque session contient les templates curl complets pour discover peers, peek output, send message, claim tasks
- **Conversation fork** : clone le JSONL pour creer une branche de conversation
- **Auto-trust** : ecrit `hasTrustDialogAccepted: true` dans `~/.claude.json`
- **Token tracking** : lit les champs `usage` des JSONL dans `~/.claude/projects/` directement
- **Memoire 2 niveaux** : `_global.md` (toutes sessions) + `<session>.md` (per-session), composees dans MEMORY.md

---

### 7. OpenHands

**Concept** : Plateforme d'agents coding autonomes model-agnostic (Claude, GPT, DeepSeek, Llama). Alternative open-source a Devin. 68k+ stars.

**Architecture** : Python 3.12, FastAPI/uvicorn, LiteLLM, BrowserGym/Playwright, Docker SDK, Kubernetes client.

**Patterns cles** :
- **Container sandbox par session** : chaque session dans un Docker dedie avec un serveur HTTP interne (`action_execution_server.py`). Isolation OS reelle, pas des hooks
- **EventStream** : architecture event-driven complete. Actions (CmdRun, FileEdit, BrowseURL, IPythonRunCell, MCP) → Observations (CmdOutput, FileRead, BrowserOutput, Error). Tout est event
- **Stuck detection** : 5 patterns de boucle detectes automatiquement :
  1. Meme action+observation repetee 4x
  2. Meme action+ErrorObservation repetee 3x
  3. Monologue (MessageAction identiques sans observations)
  4. Pattern alternant (A1,O1,A2,O2,A1,O1,...) sur 6 steps
  5. Context window error loop (10+ condensations consecutives)
- **7 condenseurs** : noop, recent, observation_masking, llm_summarizing, amortized_forgetting, llm_attention (LLM score l'importance), structured_summary, pipeline
- **Delegation multi-agents** : CodeActAgent → BrowsingAgent, RepoExplorerAgent, VerifierAgent. Etats partages, iterations locales
- **SecurityAnalyzer framework** : LLM Risk Analyzer (auto-evaluation), Invariant Analyzer (detection fuites secrets), Gray Swan (API externe, politiques custom)
- **Microagents** : Markdown avec trigger par keyword. Mention "GitHub" dans le prompt → injection auto du microagent GitHub
- **Jupyter kernel persistant** : Python stateful dans le container, variables persistent entre cellules
- **Runtime swappable** : Docker local, Kubernetes, Modal, Runloop, Remote API

---

### 8. CCManager

**Concept** : TUI TypeScript (Ink/React) pour gerer des sessions PTY de n'importe quel CLI IA.

**Architecture** : Node.js, Ink (React terminal), node-pty, xterm/headless, Effect-ts.

**Patterns cles** :
- **Auto-approval avec Claude Haiku** : quand Claude Code attend une confirmation, spawne `claude -p --model haiku` avec le contenu du terminal. Haiku decide si c'est safe. Auto-disable apres 3 erreurs
- **Detection d'etat par terminal virtuel** : regex sur spinners Unicode, `esc to interrupt`, `do you want...` → 4 etats (idle, busy, waiting_input, pending_auto_approval)
- **Copie de session data** entre worktrees : copie `~/.claude/projects/[source]/` vers `~/.claude/projects/[target]/` pour transferer le contexte conversationnel
- **Detection subagents natifs** : parse `N background task(s)` et patterns `@name` dans le terminal
- **Status hooks** : script shell arbitraire execute sur changement d'etat avec env vars (`CCMANAGER_NEW_STATE`, `CCMANAGER_WORKTREE_PATH`)

---

### 9. CCSwarm

**Concept** : Framework multi-agents en Rust. Ambitieux mais partiellement implemente. Surtout interessant pour les concepts.

**Architecture** : Rust, ratatui TUI, Tokio async, MessageBus.

**Patterns cles (conceptuels)** :
- **Piece/Movement workflows** : YAML declaratifs avec etapes nommees, personas, permissions par etape, transitions conditionnelles
- **Faceted Prompting** : decompose le prompt en 5 concerns orthogonales — Persona, Policy, Instruction, Knowledge, Output Contract
- **Memory system** : working memory (capacite 7, regle de Miller), episodic, semantic, procedural. Decay rate, consolidation periodique
- **Quality Judge LLM** : sous-agent qui evalue sur 8 dimensions et genere des taches de remediation
- **auto_accept configurable** : liste de types d'operations trusted, max file changes, restricted file patterns, require_clean_git

---

### 10. claude-session-driver

**Concept** : Plugin Claude Code qui transforme une session en controller de workers via tmux. Pure bash, zero dependances.

**Architecture** : Bash scripts, tmux, fichiers JSONL dans `/tmp/claude-workers/`.

**Patterns cles** :
- **Tool approval inter-sessions** : hook PreToolUse ecrit `tool-pending`, poll `tool-decision` pendant 30s. Le controller decide allow/deny pour chaque tool call du worker
- **`.meta` file discriminator** : `/tmp/claude-workers/<session-id>.meta` distingue les sessions managed des sessions normales — un seul `stat()`
- **`--session-id` predictible** : UUID genere par le launcher, passe a `claude --session-id` → log path deterministe
- **Event stream JSONL** : chaque hook appende une ligne JSON → polling simple par `wc -l`
- **Read-turn** : lecture structuree du session log Claude (`~/.claude/projects/<encoded>/<session-id>.jsonl`) — thinking + tool calls + resultats
- **5 patterns d'orchestration** : Delegate & wait, Fan-out, Pipeline, Supervise, Hand off

---

### 11. 1code

**Concept** : Client desktop Electron pour Claude Code et Codex. GUI style Cursor avec agents background cloud.

**Architecture** : Electron, React 19, tRPC, Drizzle/SQLite, bun.

**Patterns cles** :
- **Git worktree per chat** : chaque conversation sur sa propre branche, Monaco diff viewer live
- **Message queue** : prompts envoyes pendant que l'agent travaille sont mis en file et envoyes quand il est pret
- **Rollback** : revert tous les changements depuis un message specifique
- **Fork sub-chats** : creer une branche de conversation depuis n'importe quel message
- **Plan mode** : agent pose des questions, montre les etapes, attend l'approbation avant d'executer
- **Automations** : triggers GitHub/Linear/Slack, `@1code` dans un issue GitHub start un agent cloud
- **MCP marketplace** : install en un clic, gestion visuelle des MCP servers
- **`@anthropic-ai/claude-code` SDK** : pas de PTY scraping, evenements structures

---

### 12. Codeman

**Concept** : WebUI headless pour Claude Code avec respawn controller et mobile-first.

**Architecture** : Node.js, Fastify, tmux, xterm.js, SSE, web-push VAPID.

**Patterns cles** :
- **Multi-layer idle detection** (7 couches) :
  1. Stop hook / `idle_prompt` notification
  2. Regex "Worked for Xm Xs"
  3. **AI-powered** : spawne `claude -p` avec les 16k derniers chars, demande IDLE/WORKING
  4. Output silence (pas de bytes pendant N ms)
  5. Token count stability
  6. Working pattern absence (spinners, verbes)
  7. Session.isWorking sanity check
- **Circuit breaker** sur le respawn cycle : CLOSED → HALF_OPEN → OPEN. Previent le thrashing
- **Auto-compact a 110k tokens** / auto-clear a 140k tokens avec exclusion mutuelle et retry
- **Transcript watcher** : lit `~/.claude/projects/{hash}/{sessionId}/subagents/*.jsonl` avec `fs.watch` — visibilite tool-call-level
- **Subagent watcher** : detecte teammates vs subagents via `~/.claude/teams/`
- **QR code auth** : 256-bit secret, 60s TTL, atomically consumed, rate-limited
- **Zero-lag input** : overlay DOM pour eliminer le RTT de 200-300ms (publie en npm package)
- **Cloudflare tunnel** : gestion `cloudflared` integree
- **Web push VAPID** : notifications push vers mobile sans Telegram

---

### 13. Agent Farm

**Concept** : Orchestrateur Python pour 20+ agents Claude Code en parallele sur le meme codebase. Batch bug fixing et best-practices sweeps.

**Architecture** : Python single-file (~3000 lignes), tmux, JSON state file.

**Patterns cles** :
- **Coordination via prompt** : le protocole de lock/registry/claim est entierement defini dans le prompt. Zero infrastructure — Claude suit le protocole
- **Optimistic text-file locking** : `[COMPLETED]` markers dans un fichier partage distribue le travail. Eventually consistent, degrade gracefully
- **Terminal scraping monitoring** : regex sur les patterns UI de Claude Code (spinners, prompts, errors)
- **Settings backup/restore** : backup `~/.claude/settings.json` avec tarfile avant multi-instance launch, restore sur corruption
- **Adaptive stagger** : delai entre lancements shrink on success, grow on failure
- **Active shell probe** : `echo AGENT_FARM_READY_{uuid}` + attente du marker pour handshake fiable
- **Heartbeat files** : `project/.heartbeats/agent{id}.heartbeat` — timestampe a chaque detection working/ready, stale apres 120s
- **Adaptive idle timeout** : `3 * median(cycle_times)` — s'adapte automatiquement a la duree typique des taches

---

## Matrice comparative

### Session Management

| Feature | Alfred | Paperclip | OpenClaw | Claude Squad | amux | OpenHands | Composio AO | Codeman |
|---------|--------|-----------|----------|-------------|------|-----------|-------------|---------|
| Session resume | `--resume` fichier | `--resume` DB | JSONL store | Worktree branch | `--resume` meta | EventStore replay | `--resume` metadata | `--resume` |
| Session compaction | Non | Auto (tokens/runs/age) | Pre-compaction flush | Non | Auto-compact <20% | 7 condenseurs | Non | Auto 110k/140k |
| Idle detection | Hook idle_prompt | Timer heartbeat | Configurable | Hash polling 500ms | Watchdog 60s | Stuck detector 5 patterns | JSONL activity state | 7 couches |
| Crash recovery | tmux list-sessions | DB reconciliation | Session store | Worktree restore | Auto-resume startup | EventStore replay | tmux list-sessions | Circuit breaker |
| Multi-agent | 1 session/dossier | N agents/company | N agents/gateway | N sessions paralleles | N sessions + kanban | Delegation hierarchique | N sessions + orchestrator | N sessions |

### Securite & Garde-fous

| Feature | Alfred | Paperclip | OpenClaw | Ruflo | OpenHands | Codeman | CCManager |
|---------|--------|-----------|----------|-------|-----------|---------|-----------|
| Tool-level blocking | Hooks PreToolUse (prompt) | Non | Tool policy + exec approval | ContinueGate + WASM | SecurityAnalyzer framework | Non | Auto-approval Haiku |
| Approval flow | Telegram notif (one-way) | DB record + UI + resume | Chat inline `/approve` | Claims system | LLM risk assessment | Non | Non |
| Budget control | Non (Claude Max) | Hard-stop per-agent | Non | Tier routing | Token limits | Non | Non |
| Audit trail | actions.log text | Activity log DB | Non | Proof Envelope (HMAC) | EventStore JSON | Non | Non |
| Sandbox | Non (macOS direct) | Non | Docker optional | Non | Docker/K8s obligatoire | Non | Non |

### Memoire & Contexte

| Feature | Alfred | OpenClaw | Ruflo | amux | OpenHands | Codeman |
|---------|--------|----------|-------|------|-----------|---------|
| Cross-session memory | state.md per-dossier | MEMORY.md + vector SQLite | ReasoningBank + MemoryGraph + AutoMemoryBridge | MEMORY.md 2 niveaux | Condensation (pas de memoire persistante) | Transcript JSONL |
| Semantic search | Non | Hybrid BM25+vector+MMR | HNSW + PageRank | Non | Non | Non |
| Auto-injection | CLAUDE.md 2 niveaux | Today+yesterday auto-inject | Before each task | MEMORY.md avant chaque launch | Microagents par keyword | Non |
| Pre-compaction save | Non | Oui (flush silencieux) | AutoMemoryBridge | Non | Non | Non |

### Notifications & UI

| Feature | Alfred | Paperclip | OpenClaw | Codeman | 1code | Composio AO |
|---------|--------|-----------|----------|---------|-------|-------------|
| Canal principal | Telegram | WebSocket UI | Chat natif (WhatsApp/Telegram/etc) | Web push VAPID | Desktop Electron | Desktop/Slack/Discord/email |
| Mobile | Non natif | React responsive | Chat apps natives | QR auth + PWA | PWA secondary | Non |
| Terminal web | xterm.js | Non | Non | xterm.js zero-lag | Non (Electron natif) | Web terminal |
| Real-time updates | SSE | WebSocket | Chat messages | SSE | SDK events | SSE |

---

## Patterns innovants a reprendre

### Priorite HAUTE — Impact immediat sur Alfred

#### 1. Watchdog auto-compact + restart-on-corruption (amux)
**Quoi** : Boucle toutes les 60s qui detecte `context left < 20%` → `/compact`, detecte `redacted_thinking` → restart + replay du dernier message.
**Pourquoi** : Les dossiers admin durent des heures. Sans ca, une session qui atteint la limite de contexte meurt silencieusement. Le restart-on-corruption gere un bug connu de Claude Code.
**Effort** : Moyen. Ajouter dans `session.ts` un polling tmux capture-pane + parsing.

#### 2. Multi-layer idle detection (Codeman)
**Quoi** : 7 couches de detection dont un AI-powered check (spawne `claude -p` pour auditer le terminal).
**Pourquoi** : Le idle timer fixe 1h d'Alfred est un instrument grossier. Un session bloquee sur un prompt depuis 30 min n'est pas idle mais waiting.
**Effort** : Moyen. Remplacer le idle timer par un pipeline de detection.

#### 3. Pre-compaction memory flush (OpenClaw)
**Quoi** : Tour agent silencieux automatique quand le contexte approche la limite, poussant le modele a ecrire ses notes durables AVANT que la compaction ne detruise l'etat en RAM.
**Pourquoi** : Alfred perd de l'information quand Claude auto-compacte. Ce pattern preserve automatiquement le contexte important.
**Effort** : Moyen. Detecter le seuil de contexte (via capture-pane ou JSONL) et injecter un prompt de sauvegarde.

#### 4. Lecture JSONL des session logs (claude-session-driver, Codeman, amux)
**Quoi** : Lire `~/.claude/projects/<encoded-path>/<session-id>.jsonl` directement pour avoir les tool calls, tokens, thinking — pas du PTY scraping.
**Pourquoi** : Donne une visibilite structuree sur ce que fait Claude sans parser du terminal. Exploitable pour le dashboard web, le token tracking, et le stuck detection.
**Effort** : Faible. Watcher `fs.watch` sur le bon path.

#### 5. `--session-id` predictible (claude-session-driver)
**Quoi** : Passer un UUID genere par le launcher a `claude --session-id <uuid>` au lieu de laisser Claude generer le sien.
**Pourquoi** : Le backend sait exactement ou lire le JSONL sans parser quoi que ce soit. Simplifie toute l'integration read-turn + transcript.
**Effort** : Tres faible. Un changement dans `session.ts`.

### Priorite MOYENNE — Ameliorations significatives

#### 6. Approval flow persistant (Paperclip)
**Quoi** : Au lieu de DENY un tool call et perdre l'etat, creer un record d'approbation, pauser la session, notifier Telegram, reprendre avec la decision.
**Pourquoi** : Aujourd'hui un hook DENY bloque Claude qui ne comprend pas pourquoi. Un flow pause/approve/resume est plus propre.
**Effort** : Eleve. Necessite de modifier le hook handler, ajouter un store d'approbations, et un endpoint Telegram pour repondre.

#### 7. Stuck detection automatique (OpenHands)
**Quoi** : 5 patterns de boucle detectes dans l'historique d'events (repetition, erreur repetee, monologue, alternance, condensation loop).
**Pourquoi** : Claude peut tourner en boucle pendant des heures. Alfred n'a aucun mecanisme pour le detecter.
**Effort** : Moyen. Parser le JSONL (cf. point 4) et implementer les heuristics.

#### 8. Session compaction with handoff (Paperclip)
**Quoi** : Quand les seuils sont atteints, generer un resume handoff et demarrer une nouvelle session avec ce resume.
**Pourquoi** : Meilleur que auto-compact qui perd du contexte. Le handoff preserve l'intention.
**Effort** : Moyen. Combiner avec le watchdog (point 1).

#### 9. Token tracking via JSONL (amux)
**Quoi** : Lire les champs `usage` dans les JSONL de `~/.claude/projects/` pour compter tokens par session.
**Pourquoi** : Visibilite zero-effort sur la consommation. Affichable dans le dashboard.
**Effort** : Faible. Aggregation simple des donnees JSONL.

#### 10. Heartbeat files (Agent Farm)
**Quoi** : Fichier timestamp dans `workspace/.heartbeats/` mis a jour a chaque detection d'activite. Stale = mort.
**Pourquoi** : Plus fiable que les hooks pour detecter les sessions mortes. Supplement au crash recovery.
**Effort** : Faible.

### Priorite BASSE — A considerer plus tard

#### 11. Faceted Prompting (CCSwarm)
**Quoi** : Decomposer le CLAUDE.md en 5 sections orthogonales : Persona, Policy, Instruction, Knowledge, Output Contract.
**Pourquoi** : Plus maintenable quand le CLAUDE.md grossit. Composition deterministe.
**Effort** : Faible (restructuration).

#### 12. Orchestrator-as-agent (Composio AO)
**Quoi** : Un Claude en mode meta qui coordonne les autres sessions sans coder.
**Pourquoi** : Scalability si Alfred gere 10+ dossiers simultanes.
**Effort** : Moyen.

#### 13. ReasoningBank pour triage (Ruflo)
**Quoi** : Avant de triager un event, recherche semantique des decisions de triage passees similaires.
**Pourquoi** : Reduit les appels LLM et ameliore la coherence du triage.
**Effort** : Eleve (embeddings, vector store).

#### 14. Context steering mid-run (OpenClaw)
**Quoi** : Injecter un message dans une run en cours apres chaque tool call.
**Pourquoi** : Plus propre que `tmux send-keys` pour rediriger une session.
**Effort** : Eleve (necessite ACP ou modification du runtime).

#### 15. Kanban SQLite inter-sessions (amux)
**Quoi** : Queue de taches SQLite avec claiming atomique pour coordination entre sessions.
**Pourquoi** : Si Alfred a besoin de coordination inter-dossiers.
**Effort** : Moyen.

---

## Ce qu'Alfred fait mieux

| Avantage Alfred | Detail | Qui s'en approche |
|-----------------|--------|-------------------|
| **Hooks PreToolUse non-contournables** | Cote systeme, Claude ne peut pas les skipper ni les voir. Mini-Claude verificateur pour les actions sensibles | Aucun — OpenHands a des analyzers mais optionnels, Paperclip a des approvals mais cooperatifs |
| **Triage intelligent event → dossier** | One-shot Claude qui lit tous les state.md et decide le routage. Matching des events entrants contre `## En attente` | Aucun — tous les autres requierent une assignation manuelle ou un board |
| **Modele "dossier long-lived"** | Un dossier admin peut durer des jours, avec attente d'events externes, reprise sur critere. Le state.md capture l'etat complet | Aucun — les autres projets sont orientes sessions courtes ou coding tasks |
| **macOS natif** | osascript, Shortcuts, Messages, Calendar, Contacts, Finder. Profondeur d'integration systeme | OpenClaw a des companion nodes iOS/Android mais pas le meme niveau |
| **Camoufox anti-detection** | Browser fingerprint-resistant, profils persistants par dossier, isolation totale | Aucun — tous utilisent Playwright/Chrome standard |
| **Zero-cost model** | Claude Max subscription, pas de compteur tokens, pas de budget a gerer | Aucun — tous les autres ont du cost tracking ou sont API-based |
| **CLAUDE.md 2 niveaux** | Contexte global (workspace) + specifique (per-dossier), genere dynamiquement par le backend | OpenHands a les Microagents, Ruflo a le Faceted Prompting |
| **Simplicite architecturale** | Pas de DB, pas de Docker, pas de message bus. Markdown + tmux + hooks | amux est comparable en simplicite |

---

## Ce qu'Alfred ne sait pas faire

### Gaps critiques (impactent le use case actuel)

| Gap | Impact | Solution la plus pertinente |
|-----|--------|----------------------------|
| **Pas de watchdog auto-compact** | Sessions qui meurent silencieusement sur les dossiers longs | amux : polling 60s + `/compact` + restart |
| **Pas de stuck detection** | Claude tourne en boucle sans que personne ne le sache | OpenHands : 5 patterns de boucle + Codeman : multi-layer idle |
| **Idle timer grossier (1h fixe)** | Ne distingue pas idle/waiting/stuck/busy | Codeman : 7 couches de detection |
| **Perte de contexte a la compaction** | Information perdue quand Claude auto-compacte | OpenClaw : pre-compaction flush |
| **Pas de visibilite structuree sur les sessions** | Le backend sait juste "tmux tourne ou pas" | JSONL parsing (amux, Codeman, claude-session-driver) |

### Gaps secondaires (utiles mais pas bloquants)

| Gap | Impact | Solution la plus pertinente |
|-----|--------|----------------------------|
| **Pas de token tracking** | Aucune idee de la consommation | amux : lecture JSONL usage |
| **Pas de memoire semantique cross-dossiers** | Chaque dossier est un silo de connaissance | Ruflo : ReasoningBank + OpenClaw : vector memory |
| **Approval flow binaire** (deny ou rien) | Claude perd l'etat quand un hook DENY | Paperclip : approval record + pause + resume |
| **Pas de notifications push mobile** | Depend de Telegram | Codeman : Web Push VAPID |
| **Pas de coordination inter-dossiers** | Un dossier ne peut pas deleguer a un autre | amux : kanban SQLite + API REST |
| **Pas de subagent visibility** | Pas de suivi des Task tools spawnes par Claude | Codeman : transcript watcher sur subagents/*.jsonl |
| **Crash recovery fragile** | Si tmux meurt sans hook SessionEnd, lock orphelin | Agent Farm : heartbeat files + Composio AO : JSONL activity detection |

---

## Recommandations prioritaires

### Sprint 1 — Robustesse des sessions (impact immediat)

1. **Watchdog module** : polling `tmux capture-pane` toutes les 60s
   - Detecter `context left < 20%` → envoyer `/compact`
   - Detecter `redacted_thinking` → restart + replay
   - Detecter shell prompt sans Claude UI → restart
   - Source : amux

2. **`--session-id` predictible** : generer l'UUID dans le launcher, passer a `claude --session-id`
   - Source : claude-session-driver

3. **JSONL watcher** : `fs.watch` sur `~/.claude/projects/<hash>/<session-id>.jsonl`
   - Token tracking, activity state, tool call visibility
   - Source : amux, Codeman, claude-session-driver

4. **Heartbeat files** : `workspace/<dossier>/.heartbeat` timestamp toutes les 60s quand actif
   - Stale detection au startup pour crash recovery
   - Source : Agent Farm

### Sprint 2 — Detection intelligente

5. **Multi-layer idle detection** remplacant le timer fixe 1h
   - Layer 0 : hooks (deja en place)
   - Layer 1 : silence output (pas de bytes dans capture-pane)
   - Layer 2 : JSONL activity (dernier event timestamp)
   - Layer 3 : AI-powered check (optionnel, `claude -p` one-shot)
   - Source : Codeman

6. **Stuck detection** via parsing JSONL
   - Meme outil repete 4+ fois
   - Erreurs en boucle
   - Monologue sans actions
   - Source : OpenHands

7. **Pre-compaction memory flush** : quand le contexte approche la limite, injecter un prompt de sauvegarde dans la session
   - Source : OpenClaw

### Sprint 3 — Intelligence

8. **Session compaction with handoff** : quand une session atteint les limites, generer un resume et demarrer une nouvelle session
   - Source : Paperclip

9. **Approval flow** : transformer les hooks DENY critiques en pause + notification Telegram + resume
   - Source : Paperclip

10. **Dashboard enrichi** : token usage, activity timeline, tool calls, subagent tree
    - Source : Codeman, Composio AO

---

## Conclusion

L'ecosysteme d'orchestration d'agents IA est en explosion (mars 2026). Alfred se distingue par son modele unique "dossier administratif long-lived" avec triage intelligent et hooks non-contournables — aucun autre projet n'a ce positionnement.

Les gaps les plus critiques sont tous lies a la **robustesse des sessions longues** : watchdog, stuck detection, pre-compaction flush, idle detection multi-couches. Ces patterns sont bien documentes dans amux, Codeman et OpenClaw, et adaptables a notre architecture sans refonte majeure.

La lecture directe des JSONL de Claude Code (`~/.claude/projects/`) est le **multiplicateur de force** le plus sous-estime : token tracking, activity detection, stuck detection, transcript viewing — tout decoule de cette seule source de donnees que personne dans Alfred ne lit aujourd'hui.
