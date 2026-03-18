# Alfred — Spec complète

**Projet** : Alfred (V2 de l'assistant personnel)
**Repo** : `alfred` (nouveau repo séparé de AI-assistant)
**Date** : 2026-03-14

Spec consolidée : architecture, stack technique, hooks, et 148 tests E2E.
Source de vérité unique pour le plan d'implémentation.

---

## 1. Vision

Un assistant personnel qui tourne 24/7, capable de gérer des dossiers administratifs
en autonomie. Il travaille méthodiquement en fond, ne dérange Lolo que quand c'est
nécessaire, et s'améliore au fil du temps.

### Ce que V1 a prouvé

Lolo a commencé par le skill `/comptable` — facturation, timesheets, dépenses. En
voyant Claude Code travailler, il a constaté que Claude est quasi 100% autonome sur
des tâches admin complexes. Le seul point de blocage : l'authentification (captcha,
MFA). Le problème n'est pas la capacité de Claude — c'est l'orchestration autour.

### Les vrais besoins (benchmark V2)

9 tâches concrètes que V2 doit gérer :

1. Remplir les justificatifs de dépenses (portail bancaire)
2. Vérifier les factures manquantes (1/mois 2025-2026), créer celles qui manquent
3. Récupérer les timesheets dans les mails, identifier les manquants
4. Répondre aux demandes de justificatifs de la comptable
5. Envoyer la demande de non-dom au comptable (Chypre)
6. Vérifier l'expatriation côté Belgique
7. Appeler Bruno (comptable belge) pour suivi fermeture société
8. Mettre en vente sur 2ememain + gérer les acheteurs
9. Exali.com : rapport annuel assurance pro

**Pattern commun** : multi-étapes sur plusieurs jours/semaines, navigation web,
données sensibles (financier, légal), checkpoints humains obligatoires à certains
moments, interactions imprévisibles (MFA, captcha), suivi dans le temps (relances,
vérifications).

### Ce que V1 a de trop

~3000 lignes de TypeScript qui réimplémentent ce que Claude fait nativement :
triage IA custom, event processor/router, conversation manager + style mimicry,
knowledge base structurée, queue avec logique de priorité. On a "construit un
cerveau autour du cerveau."

V2 garde l'infrastructure solide (locks, dédup, retry) et les outils (skills, MCP),
et remplace tout le "cerveau" par Claude lui-même.

---

## 2. Principes validés

### Principe 1 — La vitesse n'est pas un critère

L'assistant gère des dossiers administratifs, pas des conversations temps réel. Que
Claude mette 10 secondes ou 2 minutes pour trier un email, le résultat est le même.

**Conséquences** : pas d'optimisation de latence, pas de queue avec priorités
ultra-fines. On se concentre sur la qualité des résultats.

**Exception** : l'usage interactif direct (Lolo dans un terminal Claude Code) — là
c'est du live, mais c'est géré nativement.

### Principe 2 — Claude Code est le moteur d'exécution

Tout le travail est fait par Claude Code, qui utilise Claude Max (abonnement fixe).

**Pourquoi** : Claude Code a déjà tout l'écosystème — skills, MCP servers, browser
automation, accès système macOS, session resume. Reconstruire ça avec l'API ou
l'Agent SDK coûterait des semaines de travail pour un résultat équivalent.

### Principe 3 — Le budget n'est pas une contrainte

Pas de compromis d'architecture pour économiser des tokens ou des ressources. On
peut lancer plusieurs sessions en parallèle. Les limites pratiques de Claude Max
(rate limits, parallélisme) restent à évaluer empiriquement.

### Principe 4 — L'intelligence est dans Claude, pas dans le code

Le code backend ne contient PAS de logique métier, de triage, de décision, de
routing intelligent. Il fait de la plomberie : recevoir events, lancer Claude,
persister l'état. Claude décide quoi faire, comment, dans quel ordre.

**Nuance** : certaines fonctions backend NE SONT PAS de l'intelligence — dédup
events, resource locks, retry/backoff, audit trail, crash recovery. C'est de
l'infrastructure, pas de la décision. Ça reste dans le code.

### Principe 5 — Pas d'interruption — parallélisme isolé

Si Claude travaille sur une facture, il finit. Un event urgent ne l'interrompt
pas — il lance une nouvelle session parallèle. Chaque Claude a son propre espace
et ses propres ressources. Les conflits de ressources sont gérés par les locks.

### Principe 6 — L'assistant tourne en fond, tranquillement

Pas de réactivité à la seconde. L'assistant travaille méthodiquement, vérifie
régulièrement, avance sur les dossiers.

**Modèle retenu** : hybride events + crons.
- Event-driven pour les stimuli externes (webhook Gmail, message Telegram)
- Cron périodique pour le travail de fond (vérifier les dossiers, relances, deadlines)

### Principe 7 — Actions rapides/interactives = outil spécialisé

Si un cas d'usage demande de la réactivité ou de l'interactivité (conversations
temps réel, réservations en live), c'est un outil/skill spécialisé — pas le système
principal.

### Principe 8 — Amélioration continue

Quand Claude n'arrive pas à faire quelque chose, il reporte le gap dans
`workspace/_gaps/gaps.md`. C'est un backlog naturel d'améliorations, généré par
l'usage réel.

---

## 3. Décision structurante : le contexte est fini

### Le raisonnement

On a d'abord pensé en termes d'agents spécialisés (compta, admin, social) — Approche D.
Puis un agent unique qui gère un "bureau" — Approche C. Mais un seul agent = un seul
contexte = goulot d'étranglement.

**Le vrai problème technique n'est ni la capacité ni la vitesse — c'est que le contexte
de Claude est fini.** On ne peut pas lui donner l'état de tous les dossiers + tous les
emails + tous les messages. Même si ça rentre, la qualité se dégrade quand le contexte
est trop chargé (dégradation qui accélère après 75% d'utilisation — recherche Google ADK).

### La solution : sessions focalisées par dossier

Pas d'agents spécialisés par domaine. Un seul type d'agent : un Claude Code chargé
avec le bon contexte pour un dossier précis.

- Claude travaille sur "factures Sopra" → chargé avec : état du dossier, infos Sopra, accès Gmail.
- Claude répond à la comptable → chargé avec : l'email, les docs concernés.
- Claude remplit le rapport exali → chargé avec : état du dossier, credentials, browser.

Le même Claude, juste des contextes différents. Quand il a fini, il sauvegarde son
état et se termine. Session propre à chaque fois.

**Ce que ça résout** :
- Contexte fini → chaque session ne charge que ce dont elle a besoin
- Parallélisme → plusieurs sessions indépendantes, pas d'interférence
- Pas de dérive → sessions courtes et focalisées
- Pas de spécialisation à maintenir → un seul type d'agent, pas N prompts système

---

## 4. Architecture

### Vue d'ensemble

```
┌────────────────────────────────────────────────────────────────────┐
│                          APP WEB                                   │
│                                                                    │
│  Interface principale de Lolo :                                    │
│  - Dossiers en cours + statut                                      │
│  - Valider/refuser des actions (previews avec contexte)            │
│  - Donner des instructions / créer des dossiers                    │
│  - Debug (logs, historique, sessions)                               │
│  - Intervention MFA/captcha                                        │
│                                                                    │
└────────────────────────┬───────────────────────────────────────────┘
                         │ API
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                        BACKEND                                     │
│                     (~200-400 lignes)                               │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐                        │
│  │ RECEIVER │  │ LAUNCHER │  │ STATE MGR │                        │
│  │          │  │          │  │           │                        │
│  │ Webhooks │  │ Lance    │  │ Lit/écrit │                        │
│  │ Crons    │  │ Claude   │  │ dossiers  │                        │
│  │ App web  │  │ tmux     │  │           │                        │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘                        │
│       │              │              │                               │
│  ┌────┴──────────────┴──────────────┴──────┐                       │
│  │           INFRASTRUCTURE                │                       │
│  │  - Dedup events (content hash)          │                       │
│  │  - Resource locks (Chrome, wacli, etc.) │                       │
│  │  - Retry/backoff                        │                       │
│  │  - Crash recovery                       │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                    │
│  ┌─────────────────────────────────────────┐                       │
│  │         NOTIFICATIONS (Telegram)        │                       │
│  │  Push → Lolo (liens vers app web)       │                       │
│  └─────────────────────────────────────────┘                       │
│                                                                    │
└────────────────────────┬───────────────────────────────────────────┘
                         │ lance
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│          SESSIONS CLAUDE CODE (autonomous + interactive)            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GARDE-FOUS (Hooks PreToolUse)                                │  │
│  │                                                              │  │
│  │ Interceptent CHAQUE appel d'outil AVANT exécution.           │  │
│  │ Claude ne peut pas les contourner.                           │  │
│  │ Mini-Claude vérificateur intégré (type: "prompt").           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Session 1: "factures-2025"                                        │
│    contexte: workspace/factures-2025/state.md                      │
│    outils: Gmail MCP, /comptable, browser                          │
│                                                                    │
│  Session 2: "exali-rapport"                                        │
│    contexte: workspace/exali-rapport/state.md                      │
│    outils: browser, Bitwarden                                      │
│                                                                    │
│  (N sessions en parallèle, isolées)                                │
│                                                                    │
│  Chaque session :                                                  │
│  1. Lit state.md (où j'en suis)                                    │
│  2. Lit l'event/instruction déclencheur                            │
│  3. Travaille (skills, MCP, browser)                               │
│     → les hooks vérifient chaque action sensible                   │
│  4. Met à jour state.md                                            │
│  5. Si besoin de Lolo → checkpoint.md + termine                    │
│  6. Si fini → état "terminé" + termine                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Monorepo pnpm workspaces

```
alfred/
├── pnpm-workspace.yaml
├── package.json              # "preinstall": "npx only-allow pnpm"
├── packages/
│   └── shared/               # types TypeScript, Zod schemas
├── apps/
│   ├── backend/              # Hono API, daemon, launcher, receiver
│   └── web/                  # React SPA, Vite
```

Pas de Turborepo pour l'instant — pnpm workspaces suffit pour 2 apps + 1 package.
Si ça grandit, Turborepo se branche par-dessus sans rien changer.

---

## 5. Composants en détail

### 5.1 RECEIVER — réception des stimuli

Reçoit tout ce qui peut déclencher du travail et le transforme en event uniforme.

**Sources d'events** :

| Type | Source | Exemples |
|---|---|---|
| Push externe | Webhook Gmail | Nouvel email reçu |
| Polling | Watchers SMS/WhatsApp | Nouveau message (toutes les 5 min) |
| Cron | Travail de fond | "Vérifie les dossiers, avance ce qui peut" |
| Cron | Deadlines | "Le rapport exali est dû dans 3 jours" |
| Cron | Relances | "Sopra n'a pas répondu depuis 3 jours" |
| Instruction Lolo | App web | "Mets le bureau en vente sur 2ememain" |
| Instruction Lolo | Claude Code interactif | Lolo travaille directement |
| Instruction Lolo | Telegram | Réponse à un checkpoint |

**Format uniforme** : source, contenu, timestamp, métadonnées (expéditeur, etc.).

**Triage / routing** : Claude fait le triage (principe #4).
Un appel `claude -p` par event. Le backend passe le **contenu complet de chaque
state.md** dans le prompt — Claude voit l'objectif, le journal, et surtout les
sections `## En attente` (critères de reprise), ce qui permet un matching bien
plus précis entre un event entrant et le bon dossier.

```
claude -p --system-prompt "Mode triage. Réponds en JSON uniquement." \
  "Dossiers actifs (contenu complet de chaque state.md):\n\n--- factures-sopra ---\n# Factures Sopra\nSTATUT : EN COURS\n## En attente\nEmail envoyé à billing@sopra.com...\n\n---\n\nEvent:\nEmail de billing@sopra.com: Facture mars"
```

Réponse JSON attendue (3 cas) :
```json
{ "dossierIds": ["factures-sopra"] }
{ "suggestion": { "title": "...", "urgency": "normal", "source": "gmail", "why": "..." } }
{ "ignore": true, "reason": "spam marketing" }
```

Notes :
- `dossierIds` est un tableau — un event peut concerner plusieurs dossiers (E2E-RCV-06)
- Si le dossier est déjà locké, l'event est ajouté au CLAUDE.md du dossier (section
  "Events en attente") pour traitement au prochain lancement/resume
- Pas de batching — un triage par event, le dedup élimine les doublons en amont
- Rate limits : si `claude -p` rate-limited (429), backoff exponentiel comme en V1

**Règle fondamentale : Claude ne crée jamais de dossier lui-même.** Seul Lolo peut
créer un dossier (via l'app web) ou approuver une suggestion de Claude.

### 5.2 WORKSPACE — état des dossiers

Chaque dossier en cours a un répertoire dans `workspace/` avec des fichiers markdown.
Pas de base de données pour l'état — des fichiers lisibles par l'humain ET par Claude.

```
workspace/
├── factures-2025/
│   ├── state.md          # état actuel, prochaines étapes, historique condensé
│   ├── checkpoint.md     # si en attente de Lolo : quoi, pourquoi, options
│   └── artifacts/        # fichiers produits (factures PDF, etc.)
│
├── exali-rapport-2025/
│   ├── state.md
│   └── artifacts/
│
├── _inbox/
│   └── events.md         # events non encore rattachés à un dossier
│
├── _suggestions/         # dossiers suggérés par Claude, en attente d'approbation
│   ├── impots-chypre-relance.md
│   └── timesheet-juin-manquant.md
│
├── _gaps/
│   └── gaps.md           # lacunes détectées par Claude (auto-analyse)
│
└── _audit/
    └── actions.log       # historique de toutes les actions externes
```

#### Le fichier state.md (cœur du système)

C'est la mémoire de Claude pour ce dossier. Il contient tout ce dont Claude a besoin
pour reprendre le travail dans une nouvelle session.

```markdown
# Factures Sopra 2025-2026

## Objectif
Vérifier que toutes les factures mensuelles Sopra ont été envoyées.

## État actuel
STATUT: EN COURS
Dernière action: 2026-03-13

## Ce qui est fait
- Jan 2025: facture #2025-001 envoyée le 05/02 ✓
- Fév 2025: facture #2025-002 envoyée le 03/03 ✓

## Ce qui reste à faire
- Avr 2025: timesheet trouvé (152h), facture à créer
- Mai 2025: timesheet MANQUANT — email envoyé à Sopra le 12/03

## En attente
Email envoyé à billing@soprasteria.com le 12/03 pour le timesheet de mai.
Relancer si pas de réponse avant le 2026-03-16.

## Contacts
- Sopra billing: billing@soprasteria.com

## Notes
- Taux: 80€/h HT, devise EUR
- Format facture: utiliser /comptable avec template Sopra
```

**Condensation** : Claude gère lui-même la taille de state.md (principe #4).
S'il y a trop d'historique, il condense les anciennes entrées.

#### La section `## En attente` (critères de reprise)

Section optionnelle de state.md, en texte libre. Claude l'écrit quand il ne peut
plus avancer parce qu'il attend une info externe (réponse email, document, confirmation
d'un tiers). Distinct de `checkpoint.md` qui signale un besoin d'intervention de Lolo.

**Rôle dans le système :**
- **Triage** : le prompt reçoit le state.md complet — la section `## En attente` aide
  Claude à matcher un event entrant avec le bon dossier (ex: "ce dossier attend un
  email de sophie@comptable.fr" + un email arrive de sophie → match)
- **Checkup** : le prompt sait qu'un dossier avec `## En attente` ne doit pas être
  relancé sauf si une date de relance est mentionnée et dépassée
- **Launcher** : quand une session est relancée (event ou checkup), le backend efface
  automatiquement la section `## En attente` dans state.md avant de lancer Claude
- **UI** : la première ligne de la section est affichée sur la card du dossier dans
  l'app web, pour que Lolo voie d'un coup d'œil ce qu'un dossier attend

Claude n'a qu'une seule responsabilité : écrire la section quand il part. Le nettoyage
au retour est géré par le backend, pas par Claude.

#### Le fichier checkpoint.md

Quand Claude a besoin de Lolo (question, validation, info manquante), il écrit
un checkpoint.

```markdown
# Checkpoint — Attente validation

## Ce que j'ai fait
Créé 2 factures pour avril et mai 2025.

## Ce que j'attends de toi
Valider les factures avant envoi.

## Détails
- Facture avril: 152h × 80€ = 12,160€ HT → artifacts/facture-2025-04.pdf
- Facture mai: 160h × 80€ = 12,800€ HT → artifacts/facture-2025-05.pdf

## Options
1. [Envoyer les deux] → j'envoie à billing@soprasteria.com
2. [Modifier] → dis-moi ce qu'il faut changer
3. [Annuler] → j'annule et j'attends tes instructions
```

### 5.3 LAUNCHER — lancement des sessions Claude

Lance des sessions Claude Code avec le bon contexte. Deux modes d'exécution :

**Mode autonome (défaut) : `claude -p` child process.**

Les sessions tournent comme des child processes Node.js via `claude -p --output-format stream-json`.
Process exit = signal fiable de fin de session. Pas de polling, pas de hooks pour le lifecycle.

Avantages vs tmux :
- Lifecycle déterministe : process exit → `handleAutonomousExit()` — pas besoin de hooks/polling
- stdout NDJSON parsable en temps réel (stream events pour le frontend)
- Post-session agent automatique (extraction mémoire, gaps, journal)
- Plus simple : pas de tmux capture-pane, pas d'idle detection, pas de nudging

**Mode interactif ("Prendre la main") : tmux pour Lolo.**

Quand Lolo veut interagir directement :
1. Clic "Prendre la main" dans l'app web
2. Backend kill le child process autonome
3. Lance `claude --resume <session-id>` dans tmux
4. Lolo interagit via ttyd (terminal dans l'app web)
5. "Rendre la main" kill tmux et relance en mode autonome

**Contexte chargé via CLAUDE.md (2 niveaux)** :

Niveau 1 — `workspace/CLAUDE.md` (global, écrit une fois, partagé par toutes les sessions) :
- Identité (assistant de Lolo, français, style d'écriture)
- Comment travailler (lire state.md, mettre à jour le journal, écrire checkpoint.md si bloqué)
- Formats attendus (state.md, checkpoint.md, suggestions, gaps)
- Outils disponibles (Gmail MCP, Camoufox, Bitwarden, etc.)
- Règles de sécurité (ne pas réessayer si un hook refuse)

Niveau 2 — `workspace/<dossier>/CLAUDE.md` (généré par le backend à chaque lancement) :
- Objectif du dossier
- Mode confirm (oui/non)
- Event ou instruction déclencheur
- Contacts pertinents (pré-fetchés depuis macOS Contacts)

Claude Code charge automatiquement les CLAUDE.md du cwd + parents. Ça persiste entre
les `--resume`. Pas besoin de repasser le contexte via CLI.

**Commande autonome concrète** :
```
# Child process Node.js (spawn)
claude -p --output-format stream-json --verbose --dangerously-skip-permissions \
  [--plugin-dir plugins/alfred-hooks] [--resume <session-id>] "<instruction>"
# cwd = workspace/<dossier-id>/
```
L'instruction/event est passée en argument CLI. Le CLAUDE.md du dossier fournit le contexte.

**Commande interactive (tmux, "Prendre la main" seulement)** :
```
tmux new-session -d -s alfred-<dossier-id> \
  "cd workspace/<dossier-id> && claude --dangerously-skip-permissions --resume <session-id>"
```

**Pour le sweep et le triage** (`claude -p`, one-shot, pas de resume) :
```
claude -p --system-prompt "Mode sweep. Analyse workspace/..." "Lis workspace/*/state.md..."
claude -p --system-prompt "Mode triage." "Event: email de comptable@sopra.com..."
```
Pas de CLAUDE.md dédié — `--system-prompt` suffit pour les appels one-shot.

**Parallélisme** : plusieurs child processes en même temps, chacun sur un dossier
différent. Locks de dossier (PID, `/tmp/assistant-locks/`) pour empêcher deux
sessions de travailler sur le même dossier.

**Sessions Claude** :
- **`--dangerously-skip-permissions`** sur toutes les sessions — désactive les
  prompts de permission Claude Code. La sécurité est assurée par les hooks
  PreToolUse (garde-fous), pas par le système de permissions intégré.
  Les hooks firent AVANT le check de permissions, donc restent actifs.
- Lock PID par dossier dans `/tmp/assistant-locks/`
- Crash recovery : reconcilie tmux survivors (interactives) + relance dossiers orphelins EN COURS (autonomes)
- Session ID persisté dans `workspace/<dossier>/.session-id` pour resume

**Browser : Camoufox** (pas Chrome/Playwright). Chaque session a sa propre instance
Camoufox avec un profil isolé. Avantages :
- Parallélisme total — plus de lock browser entre agents
- Anti-détection (pas détecté comme bot par les sites)
- Sessions persistantes par profil (cookies, login conservés entre sessions)
- Lolo garde Chrome pour lui, aucune interférence

**Détection d'état** : en mode autonome, le lifecycle est géré par process exit →
`handleAutonomousExit()`. Les hooks `type: "command"` restent pour l'audit et le mode
interactif.

| Hook | Signal | Action backend |
|---|---|---|
| `idle_prompt` | Claude attend un input (mode interactif) | Notification + SSE |
| `SessionEnd` | Session terminée | Audit log + SSE (lifecycle géré par process exit en autonome) |
| `Stop` | Claude arrête de générer | Audit log + SSE |
| `PostToolUse` | Action exécutée | Audit log |

**Post-session agent** : s'exécute automatiquement après process exit dans
`handleAutonomousExit()` — extraction mémoire, vérification gaps, journal. Déclenché
uniquement si le transcript est substantiel.

**Checkpoint.md** : optionnel (best-effort). Si Claude l'écrit → résumé structuré dans l'app.
En mode autonome, le process exit déclenche la vérification de l'état (TERMINÉ, BLOQUÉ, checkpoint).

### 5.4 GARDE-FOUS — hooks PreToolUse

C'est le composant le plus critique. Claude a accès à tout : emails, banque,
factures, browser. Une erreur a des conséquences réelles.

#### Le problème fondamental

Le cas le plus dangereux : Claude est CONFIANT mais a TORT. Il ne va pas déclencher
ses propres garde-fous parce qu'il pense que tout va bien.

Stats clés :
- Si un agent a 85% de précision par action, un workflow de 10 étapes ne réussit
  que 20% du temps (erreurs composées)
- CMU 2025 : les LLMs restent confiants même quand ils se trompent
- RLHF aggrave le problème (49.71% accuracy avec 39.25% calibration error)

#### La solution : hooks PreToolUse `type: "prompt"`

Claude Code a des **hooks PreToolUse** — du code qui s'exécute automatiquement,
côté SYSTÈME, avant chaque appel d'outil. Ce n'est PAS une instruction à Claude.
Claude ne les appelle pas, ne peut pas les skipper, ne sait même pas qu'ils existent.

```
Claude décide : "j'envoie cet email"
    ↓
Claude appelle l'outil : gmail.send(...)
    ↓
AUTOMATIQUEMENT, AVANT l'exécution :
    → le hook PreToolUse se déclenche
    → mini-Claude évalue l'action (contexte séparé, pas la même session)
    → décision : ALLOW / DENY / ASK
    ↓
Si ALLOW → l'action s'exécute
Si DENY  → Claude reçoit "action refusée : [raison]"
Si ASK   → Lolo est notifié et doit approuver
```

Le hook `type: "prompt"` est un mini-Claude vérificateur INTÉGRÉ dans le système
de hooks. Son propre contexte séparé. Ce n'est PAS la même session qui s'auto-vérifie.

#### Configuration hooks centralisée

**2 types de hooks, 2 rôles distincts** :
- `type: "prompt"` → **Garde-fous** (mini-Claude évalue ALLOW/DENY). Bloquant.
- `type: "command"` → **Détection + audit** (notifie le backend). Non-bloquant.

Les deux cohabitent sur le même matcher (exécution parallèle).

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__gmail__reply|mcp__gmail__draft",
        "hooks": [
          { "type": "prompt", "prompt": "Vérifie cet envoi d'email. Règles : ne jamais faire de paiement sans approbation, vérifier la cohérence des montants et destinataires, signaler toute anomalie.", "timeout": 30 },
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      },
      {
        "matcher": "mcp__camofox__click|mcp__camofox__fill_form|mcp__camofox__camofox_evaluate_js",
        "hooks": [
          { "type": "prompt", "prompt": "Vérifie ce clic/formulaire. Si c'est un bouton de paiement, de soumission financière, ou de confirmation irréversible, DENY. Sinon ALLOW.", "timeout": 10 },
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__gmail__|mcp__camofox__",
        "hooks": [
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
        ]
      }
    ],
    "SessionEnd": [
      { "type": "command", "command": "curl -s -X POST http://localhost:3001/api/hooks -d @-" }
    ]
  }
}
```

#### Couverture des hooks

| Outil | Hook ? | Timeout | Justification |
|---|---|---|---|
| Gmail send/reply/draft | Oui (prompt) | 30s | Actions irréversibles vers l'extérieur |
| Camoufox click/fill_form | Oui (prompt) | 10s | Peut déclencher paiements/soumissions |
| Camoufox evaluate/run_code | Oui (prompt) | 10s | Exécution JS arbitraire |
| Bash (patterns réseau) | Oui (command) | 10s | curl POST, ssh, scp = actions externes |
| Gmail search/read | Non | — | Lecture seule, zéro risque |
| Camoufox navigate/snapshot | Non | — | Navigation/lecture, zéro risque |
| Read/Grep/Glob/Write interne | Non | — | Opérations locales, zéro risque |

#### Les 4 règles ADN

1. **Toute action irréversible → humain** (hook ASK)
2. **Toute action externe → vérifiée avant exécution** (hook ALLOW/DENY)
3. **Toute anomalie détectée → signalée** (hook + notification)
4. **Tout est loggé → réparable après coup** (PostToolUse audit trail)

#### Limites honnêtes

1. Le mini-Claude peut aussi se tromper — mais deux Claude indépendants se trompant pareil c'est moins probable
2. Le browser reste le point le plus faible — le champ `element` aide beaucoup mais "Submit" ne dit pas toujours ce qui est soumis
3. Le ralentissement browser — 10s par clic significatif. Acceptable (principe #1)
4. Les hooks prompt utilisent du contexte Claude — à monitorer
5. Les cas non anticipés — aucun système ne couvre 100%. Le filet ultime c'est l'audit trail + la réparabilité

### 5.5 APP WEB — interface principale de Lolo

L'app web remplace le combo Telegram+Dashboard de V1 comme interface principale.

**Vues principales** :

| Vue | Route | Contenu |
|---|---|---|
| Home | `/` | Dossiers en cours + statut, actions en attente, suggestions, sessions actives, activité récente |
| Dossiers | `/dossiers` | Liste avec filtres Actifs/Terminés/Bloqués, recherche |
| Dossier | `/dossier/:id` | State.md rendu, checkpoint résumé, sidebar (session, fichiers, historique), barre d'instruction |
| Terminal | `/terminal` | Sessions tmux (mode interactif) — interaction directe avec Claude |
| Nouveau | `/nouveau` | Créer un dossier + recommandations en dessous |
| Améliorations | `/ameliorations` | Limites détectées par l'assistant, backlog d'évolutions |

**Checkpoints** : quand Claude écrit un checkpoint.md, l'app web affiche un
résumé court (1-2 lignes) sur la page du dossier et sur la Home, avec un bouton
"Ouvrir le terminal". Lolo ouvre le terminal, lit le détail, et répond directement
dans la conversation. Pas de pages checkpoint dédiées, pas de boutons d'action
dans l'UI (le terminal est le bon endroit pour ça).

**Mobile** : PWA responsive, pas d'app native. Desktop = icon rail gauche, mobile = tab bar bas.

### 5.6 NOTIFICATIONS — Telegram (rôle réduit)

Telegram n'est plus l'interface principale. Il sert uniquement de push notification
vers Lolo avec un lien vers l'app web.

**Types** :
- "Facture avril prête à valider → [Voir dans l'app]"
- "Bloqué sur exali.com (MFA) → [Intervenir]"
- "Relance envoyée à Sopra pour timesheet mai"

PAS d'actions depuis Telegram — juste des notifications. Les actions nécessitent le
contexte visuel de l'app.

### 5.7 AMÉLIORATIONS — détection des limites

Quand Claude n'arrive pas à faire quelque chose, il écrit dans
`workspace/_gaps/gaps.md` :

```markdown
## 2026-03-14 — Connexion exali.com
Problème: Le site demande un MFA par app mobile (authenticator).
Impact: Je ne peux pas remplir le rapport annuel.
Suggestion: Ajouter un skill pour lire les codes TOTP.
```

Visible dans la page "Améliorations" de l'app web. Logs/Audit trail : pas de page
dédiée, activité récente sur le tableau de bord avec lien "Voir les logs complets".

### 5.8 SUGGESTIONS — Claude propose, Lolo décide

Claude ne peut pas créer de dossiers. Il crée des suggestions dans `workspace/_suggestions/`.

**Sources** :
- Event entrant sans dossier existant
- Observation du sweep (deadline, relance)
- Découverte opportuniste en travaillant sur un autre dossier

**Format** (`workspace/_suggestions/<slug>.md`) :

```markdown
# Suggestion — Relance impôts chypriotes

URGENCE: urgent
SOURCE: Email reçu de tax@cyprus.gov.cy le 12/03
DATE: 2026-03-14

## Résumé
Email des impôts chypriotes reçu il y a 2 semaines, sans réponse.

## Pourquoi
Deadline fiscale fin mars. Pas de dossier existant pour le suivi.

## Ce que je ferais
Créer un dossier, analyser l'email, préparer les documents demandés.
```

**Niveaux d'urgence** : `urgent` (deadline proche), `normal` (à traiter quand possible), `faible` (opportunité).

**Dans l'app web** : section dédiée sur la Home. Deux actions : "Créer le dossier" ou "Ignorer".
Urgence indiquée visuellement par bordure gauche colorée. Les urgentes déclenchent une notification Telegram.

---

## 6. Flux principaux

### Flux 1 : Event externe → action

```
1. Gmail webhook → RECEIVER reçoit "email de comptable@cabinet.com"
2. RECEIVER dédup → pas un doublon → crée un event
3. LAUNCHER lance Claude (child process autonome) avec l'event
4. Claude :
   a. Lit l'email (Gmail MCP)
   b. Regarde les dossiers workspace/ → matche "demande-comptable"
   c. Lit workspace/demande-comptable/state.md
   d. Prépare la réponse avec les justificatifs
   e. Appelle gmail.reply(...)
      → HOOK PreToolUse se déclenche automatiquement
      → Mini-Claude vérifie : "réponse cohérente, destinataire connu → ALLOW"
      OU → "montant anormal → DENY" OU → "première interaction → ASK"
   f. Si ALLOW → email envoyé, PostToolUse log l'action
   g. Si ASK → Lolo notifié, doit approuver dans l'app
   h. Met à jour state.md
5. NOTIFICATION → Telegram si pertinent
```

### Flux 2 : Travail de fond (cron)

```
1. Cron périodique → LAUNCHER lance Claude sweep (claude -p)
2. Claude sweep :
   a. Parcourt les workspace/*/state.md
   b. Identifie les dossiers qui ont besoin d'action
   c. Crée des suggestions si besoin
   d. Retourne la liste des dossiers à lancer
3. Backend parse → lance sessions autonomes focalisées
4. Chaque session travaille indépendamment
5. NOTIFICATION → résultats pertinents
```

### Flux 3 : Instruction de Lolo

```
1. Lolo ouvre l'app web → "Mets le bureau en vente sur 2ememain, prix 300€"
2. BACKEND crée le dossier workspace/2ememain-bureau/ + state.md initial
3. LAUNCHER lance Claude avec l'instruction + le state.md
4. Claude :
   a. Lit state.md, commence le travail
   b. Commence sur 2ememain (browser)
   c. A besoin de photos → checkpoint.md
5. NOTIFICATION → Telegram → lien app web
6. Lolo envoie les photos via l'app
7. LAUNCHER relance Claude avec les photos
8. Claude crée l'annonce, preview → checkpoint.md
9. Lolo valide → annonce publiée
```

### Flux 4 : Blocage MFA/captcha

```
1. Claude travaille sur le rapport exali (session autonome)
2. Va sur exali.com → login → Bitwarden → OK
3. Le site demande un code MFA
4. Claude écrit checkpoint.md + STATUT : BLOQUÉ
5. Process exit → handleAutonomousExit() → notification Telegram
6. Lolo clique "Prendre la main" → tmux interactif via ttyd
7. Lolo résout le MFA → "Rendre la main" → relance autonome
```

---

## 7. Intervention humaine et lifecycle des sessions

### Mode autonome (défaut)

En mode autonome, Claude travaille comme un child process. Quand il est bloqué :

1. Il écrit checkpoint.md avec ce qu'il attend
2. Il met `STATUT : BLOQUÉ` dans state.md
3. Le process se termine (exit)
4. `handleAutonomousExit()` détecte l'état → notification Telegram + SSE

**Pour intervenir** : Lolo clique "Prendre la main" dans l'app web.
Le backend kill le child process et lance `claude --resume <session-id>` dans tmux.
Lolo interagit via ttyd. Quand il a fini → "Rendre la main" → kill tmux → relance autonome.

### Mode interactif ("Prendre la main")

Quand Lolo est en mode interactif (tmux via ttyd) :
- Idle timer disponible (1h par défaut) — hook `idle_prompt` → notification
- Si Lolo ne répond pas (timeout) : `tmux send-keys` pour demander la sauvegarde
- Annulation timer : prochain hook de la session → `cancelIdleTimer()`

### Post-session agent

Après chaque process exit en mode autonome, `handleAutonomousExit()` :
1. Lit le state.md → détermine TERMINÉ / BLOQUÉ / EN COURS
2. Cleanup : release lock, cancel timer, kill ttyd, SSE events
3. Si transcript substantiel → lance l'agent mémoire (extraction)
4. Notifications appropriées (completed, checkpoint, etc.)

### Reprendre une session

`claude --resume <session-id>` (stocké dans `workspace/<dossier>/.session-id`).
Le session_id est capturé depuis l'event `result` du stream NDJSON en mode autonome.

### Crash recovery

Au startup, le backend réconcilie en deux passes :

1. **Sessions tmux (interactives)** : `tmux list-sessions` → filtre `alfred-*` →
   reconstruit les sessions avec mode `interactive`
2. **Dossiers orphelins (autonomes)** : scan `workspace/*/state.md` → relance
   ceux qui sont EN COURS et pas en attente
3. Cleanup locks stales via `cleanupStaleLocks()`

---

## 8. Cron sweep — `claude -p` périodique

**Décision** : `setInterval` dans le backend + `claude -p` pour le scan.

```
setInterval(sweep, SWEEP_INTERVAL_MS)  // défaut: 1h, configurable env var

sweep():
  claude -p \
    --system-prompt "Mode checkup. Analyse workspace/. Si un dossier a une section
    '## En attente', ne le relance PAS sauf si une date de relance y est mentionnée
    et qu'elle est dépassée. Réponds en JSON : { launch: [...], suggestions: [...] }" \
    --allowedTools "Read,Glob,Grep,Write" \
    "Lis workspace/*/state.md. Pour chaque dossier actif, dis-moi
    si une action est nécessaire (deadline, relance, travail à avancer).
    Crée des suggestions dans _suggestions/ si besoin."
  → backend parse le JSON → lance les sessions autonomes focalisées
```

**`--system-prompt` pour les one-shot** : le sweep et le triage utilisent `claude -p` avec
`--system-prompt` au lieu de CLAUDE.md (pas de resume, pas besoin de persistance).
`--allowedTools` restreint à la lecture + Write (pour créer des suggestions).

**Note** : `claude -p` est maintenant aussi le mode d'exécution principal pour les sessions
de dossier (avec `--output-format stream-json`). Le sweep/triage restent des one-shot
distincts car ils n'ont pas de contexte CLAUDE.md ni de resume.

`setInterval` suffit pour un seul timer. Pas besoin de `node-cron`.

#### Approches explorées et écartées

| Approche | Pro | Con | Verdict |
|---|---|---|---|
| Session tmux pour le sweep | Cohérent avec le reste | Plus indirect, fichier intermédiaire | **Écarté** |
| Backend pur avec métadonnées structurées | Zéro session Claude | Fragile — Claude n'écrit pas toujours les métadonnées correctement, optimise quelque chose d'inutile (Claude Max illimité) | **Écarté** |
| Hybride (2 jobs séparés) | Séparation des concerns | Mêmes problèmes que métadonnées + complexité ajoutée | **Écarté** |

---

## 9. Stack technique

### 9.1 Infrastructure

| Composant | Choix | Raison |
|---|---|---|
| Machine | Mac Mini dédié, 24/7 | macOS natif pour AppleScript, Contacts, Messages, accès système complet |
| Daemon backend | LaunchAgent macOS (`com.lolo.assistant.plist`) | Restart automatique, logs système |
| Sessions Claude | `claude -p` child process (autonome) + tmux (interactif) | Lifecycle fiable via process exit, tmux pour intervention humaine |
| Browser | Camoufox | Anti-détection, profils isolés, parallélisme |
| Frontend hosting | Coolify | Dockerfile multi-stage, deploy automatique |
| Réseau | Tunnel Cloudflare | Pas de port ouvert, accès sécurisé |
| Logs | `~/Library/Logs/` | Rotation 5MB |
| Locks | PID dans `/tmp/assistant-locks/` | Crash recovery via détection PID mort |

### 9.2 setup.sh — installation Mac Mini

**Partie 1 — Dépendances** (automatisé) :
- Homebrew, Node.js, pnpm, Claude CLI + OAuth, Camoufox, tmux, cloudflared
- Clone repo, `pnpm install && pnpm build`
- Installation LaunchAgent + tunnel Cloudflare

**Partie 2 — Permissions macOS** (guidé, clics manuels) :

Le script ouvre chaque panneau System Settings et attend confirmation.
L'astuce : accorder les permissions à **Terminal.app**. Tous les processus
enfants héritent automatiquement.

| Permission | Panneau | Accorder à |
|---|---|---|
| Full Disk Access | Privacy & Security → Full Disk Access | Terminal.app |
| Accessibility | Privacy & Security → Accessibility | Terminal.app |
| Automation (Messages) | Privacy & Security → Automation | Terminal → Messages |
| Automation (Contacts) | Privacy & Security → Automation | Terminal → Contacts |
| Automation (Calendar) | Privacy & Security → Automation | Terminal → Calendar |
| Automation (Finder) | Privacy & Security → Automation | Terminal → Finder |
| Automation (System Events) | Privacy & Security → Automation | Terminal → System Events |
| Screen Recording | Privacy & Security → Screen Recording | Terminal.app |
| Input Monitoring | Privacy & Security → Input Monitoring | Terminal.app |
| Developer Tools | Privacy & Security → Developer Tools | Terminal.app |

**Approche écartée : profils PPPC (.mobileconfig)** — nécessitent MDM, impossible
sur un Mac perso. Screen Recording et Camera ne peuvent JAMAIS être pré-autorisés
même avec MDM.

### 9.3 Backend

| Composant | Choix | Raison |
|---|---|---|
| Runtime | Node.js | Écosystème TypeScript |
| Langage | TypeScript strict | SSOT types via packages/shared |
| Framework web | Hono | SSE intégré, ~7KB, excellent TypeScript |
| Telegram bot | grammY | Mature, retry/rate limiting |
| Validation | Zod | Partagé frontend/backend via shared/ |
| Cron sweep | `setInterval` + `claude -p` | Voir section 8 |
| State (planifié) | `better-sqlite3` (`workspace/_data/alfred.db`) | 4 tables : `claude_processes`, `notifications`, `dedup_hashes`, `sessions` — remplace l'état in-memory |

**Ce que le backend fait (~200-400 lignes)** :
1. Receiver — webhooks Gmail, watchers SMS/WhatsApp, instructions app web
2. Launcher — lance sessions autonomes (`claude -p` child process), mode interactif (tmux), gère locks
3. Hook handler — endpoint centralisé `/api/hooks`, audit + SSE (lifecycle géré par process exit en autonome)
4. State manager — lit les fichiers workspace/ (state.md, suggestions, gaps)
5. API — routes pour l'app web (dossiers, suggestions, sessions, fichiers)
6. SSE — events temps réel vers l'app web
7. Notifications — push Telegram via grammY
8. Infrastructure — dedup events, locks, retry/backoff, crash recovery, audit trail

**Ce que le backend ne fait PAS** :
- Pas de triage IA (Claude le fait)
- Pas de queue avec priorités
- Pas de logique métier
- Pas de conversation manager
- Pas de knowledge base

### 9.4 Frontend

| Composant | Choix | Raison |
|---|---|---|
| Framework | React 19 | React Compiler = pas de useMemo/useCallback |
| Build | Vite | Fast, standard |
| Router | React Router | Familier, bien documenté |
| Styling | Tailwind CSS | Utility-first, pas de CSS custom |
| State | Zustand | ~1KB, structure les données live |
| Terminal | xterm.js | Affiche/interagit avec les sessions tmux (mode interactif via ttyd) |
| Realtime | EventSource natif | SSE depuis le backend |

**PWA** : responsive (desktop icon rail + mobile tab bar), installable
(manifest, service worker basique).

### 9.5 Testing

| Niveau | Outil | Quand | Couvre |
|---|---|---|---|
| Unit/integration | Vitest | CI, chaque push | Backend: receiver, launcher, state manager, infra |
| E2E browser | Playwright | CI, chaque push | App web: UI, navigation, interactions |
| Smoke système | `/test` skill | Fin d'implémentation | Flux complets cross-composants avec backend réel |

### 9.6 Tooling

| Composant | Choix | Raison |
|---|---|---|
| Package manager | pnpm (enforced) | `"preinstall": "npx only-allow pnpm"` + `"packageManager": "pnpm@10.x"` |
| Linting | ESLint + Prettier | Claude les connaît mieux que Biome |
| TypeScript | strict mode | Sécurité types |

### 9.7 Packages partagés (`packages/shared/`)

Types et schemas partagés entre backend et frontend :
- Types des dossiers (statut, metadata)
- Types des suggestions (urgence, source)
- Types des events SSE
- Zod schemas pour la validation API
- Types des checkpoints

---

## 10. Hooks — référence technique

### Ce que le hook reçoit (stdin JSON)

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "ask",
  "hook_event_name": "PreToolUse",
  "tool_name": "mcp__gmail__send",
  "tool_use_id": "toolu_xxx",
  "tool_input": {
    "to": "billing@sopra.com",
    "subject": "Facture avril 2025",
    "body": "Veuillez trouver ci-joint..."
  }
}
```

Points importants :
- `tool_input` contient les paramètres COMPLETS de l'outil
- `transcript_path` pointe vers l'historique COMPLET de la conversation
- Pour les outils browser, `tool_input` contient un champ `element` (description textuelle)

### Ce que le hook peut répondre

**Simple (exit codes)** :
- `exit 0` → ALLOW (stdout affiché dans le transcript)
- `exit 2` → DENY (stderr envoyé à Claude comme explication)
- `exit 1` → erreur non-bloquante

**Structuré (JSON stdout)** :
```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow|deny|ask",
    "updatedInput": {"modified": "params"}
  },
  "systemMessage": "Message injecté dans le contexte de Claude",
  "additionalContext": "Contexte supplémentaire"
}
```

- `updatedInput` → peut MODIFIER les paramètres de l'outil avant exécution

### Matchers (sélection des outils)

Supportent les regex, case-sensitive :
```
"Bash"                                    → uniquement Bash
"mcp__gmail__send|mcp__gmail__reply"      → envois Gmail uniquement
"mcp__camofox__click|mcp__camofox__fill_form" → clics et formulaires
"*"                                       → tout
```

### Outils Playwright/Camoufox et risques

| Outil | Paramètres clés | Risque |
|---|---|---|
| `browser_navigate` | `url` | Faible |
| `browser_click` | `ref`, `element` (description) | Variable |
| `browser_type` | `ref`, `text`, `submit` | Moyen |
| `browser_fill_form` | `fields[]` | Moyen-élevé |
| `browser_evaluate` | `function` (JS code) | Élevé |
| `browser_snapshot` | `filename` | Nul |

### Contraintes

- Timeout : 60s par défaut, max 600s
- Hooks chargés au démarrage : changements nécessitent restart
- Hooks parallèles si multiple sur même matcher
- Pas de récursion : `type: "prompt"` est natif et immunisé

---

## 11. Ce qu'on réutilise de V1

| Composant V1 | Décision | Détail |
|---|---|---|
| Skills Claude Code | ✅ Intégralement | /comptable, /navigate, /sms, /whatsapp, etc. |
| MCP servers | ✅ Intégralement | Gmail, Calendar, Notion, Coolify, etc. |
| Resource locks (PID) | ✅ Mécanisme | /tmp/assistant-locks/ |
| Dedup par hash | ✅ Concept | Éviter les doublons webhook |
| Tmux sessions | 🔄 Mode interactif uniquement | "Prendre la main" — autonome = child process |
| React dashboard | ❌ Refaire | UI repensée de zéro |
| Telegram bot | 🔄 Simplifier | Notifications uniquement |
| Event bus | ❌ Remplacer | Receiver simple |
| Queue + priorités | ❌ Supprimer | Plus nécessaire |
| Triage IA custom | ❌ Supprimer | Claude décide lui-même |
| Conversation manager | ❌ Supprimer | Pas un besoin |
| Knowledge base | ❌ Supprimer | Remplacée par workspace/ |
| Style mimicry | ❌ Supprimer | Pas un besoin |

---

## 12. Approches explorées et écartées

| Approche | Idée | Ce qu'on garde | Pourquoi écartée |
|---|---|---|---|
| A — Workflows codés | Steps prédéfinis avec checkpoints | Concept de checkpoint | Steps codés = rigide. Claude s'adapte dynamiquement. |
| B — Règles YAML | Routing par pattern matching | — | Casse dès que la réalité est nuancée. |
| C — Agent unique | Un Claude, un bureau virtuel | Bureau virtuel en fichiers | Un seul contexte = goulot. Pas de parallélisme. |
| D — Multi-agent domaine | Agents compta/admin/social | Parallélisme isolé | Claude est déjà généraliste. Granularité = dossier, pas domaine. |
| E — Skills only | Tout en skills, backend 50 lignes | Intelligence dans les prompts | On a besoin de plomberie. "50 lignes" irréaliste. |
| F — Stateless pur | Chaque event = session fraîche | Sessions fraîches = robuste | Overhead cold-start. Perte état browser. |
| G — Hybride | Stateless par défaut, stateful si besoin | Compromis pragmatique | Intégré dans l'archi finale (autonome = child process, interactif = tmux). |
| H — CLIs custom | Remplacer MCP par des CLIs | — | "Programmer ce que Claude sait déjà faire" (Lolo). |

**Autres décisions écartées** :
- **Claude API / Agent SDK** : trop cher, pas d'écosystème existant
- **Agents spécialisés par domaine** : complexité sans valeur
- **`--allowedTools` pour la sécurité** : Claude contourne via browser/bash
- **File watching (chokidar/fs.watch/polling)** : watchdog simplifié à fs.watch pour `dossier:updated` SSE uniquement
- **Biome** : Claude connaît mieux ESLint+Prettier
- **Wouter** : trop peu connu vs React Router
- **Turborepo** : overkill pour 2 apps + 1 package
- **npm** : pnpm nécessaire pour les workspaces
- **PPPC mobileconfig** : nécessite MDM
- **Métadonnées structurées dans state.md** : fragile, optimise l'inutile

---

## 13. Routes API (dérivées des tests et composants)

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/webhook/gmail` | Webhook Gmail entrant |
| POST | `/api/hooks` | Endpoint centralisé hooks Claude Code |
| POST | `/api/sweep` | Déclenche un sweep manuellement |
| POST | `/api/dossier` | Créer un dossier (instruction Lolo) |
| POST | `/api/dossier/:id/resume` | Relance une session avec --resume |
| POST | `/api/dossier/:id/instruction` | Envoyer une instruction à un dossier |
| POST | `/api/dossier/:id/upload` | Upload de fichiers vers artifacts/ |
| POST | `/api/suggestion/:slug/approve` | Approuver une suggestion → crée un dossier |
| POST | `/api/suggestion/:slug/ignore` | Ignorer une suggestion |
| POST | `/api/session/:id/timeout` | Simule un timeout (dev/test) |
| POST | `/api/amelioration/:id/resolve` | Marquer un gap comme résolu |
| GET | `/api/dossiers` | Liste des dossiers |
| GET | `/api/dossier/:id` | Détail d'un dossier (state.md, checkpoint, artifacts) |
| GET | `/api/suggestions` | Liste des suggestions |
| GET | `/api/ameliorations` | Liste des gaps |
| GET | `/api/sessions` | Sessions actives (autonomes + interactives) |
| GET | `/api/notifications/recent` | Notifications récentes |
| GET | `/api/events` | SSE — events temps réel |

---

## 14. Contraintes et inquiétudes

| Sujet | Inquiétude | Solution |
|---|---|---|
| Plan incomplet | Les plans d'implémentation passés ont manqué des features | Plan piloté par les 148 tests E2E. Chaque step = IDs de tests. |
| Claude Max rate limits | Nombre de sessions parallèles inconnu | Tester empiriquement. Backend gère le backoff. |
| tmux + ttyd + xterm.js | Terminal dans le browser (mode interactif) est non-trivial | Composant isolé. ttyd expose tmux via WebSocket → xterm.js. |
| Sécurité tunnel | Backend exposé via Cloudflare | Auth sur l'API (token ou Cloudflare Access). |
| Migration V1 → V2 | Transition entre versions | V2 indépendant. V1 et V2 en parallèle. Skills/MCP réutilisés. |

---

## 15. Recherche externe — concepts clés retenus

| Concept | Source | Ce qu'on en retient |
|---|---|---|
| Constitution en langage naturel | IronCurtain | Règles simples → comportements émergents. Nos 4 règles ADN. |
| Reversible Autonomy | Rubrik, IBM STRATUS | Accepter l'erreur + la rendre réparable. Audit trail = filet de sécurité. |
| Zero-Trust Agent | Microsoft | Chaque action checked, limited, logged. |
| Excessive Agency | OWASP LLM06:2025 | 3 causes racines : trop de fonctionnalité, permissions, autonomie. |
| Confident but wrong | CMU 2025 | RLHF rend les LLMs confiants même quand ils se trompent → vérification EXTERNE. |
| Mémoire à deux niveaux | Letta/MemGPT | Core (state.md = RAM) + Archival (historique = storage). |
| Contexte qui se dégrade | Google ADK | Dégradation accélère après 75%. → Sessions courtes et focalisées. |
| Scaffolding > Raw intelligence | PAI (Miessler) | "Haiku can outperform Opus when the scaffolding is good." |

---

## 16. Capabilities futures (hors scope V2)

L'architecture doit être assez flexible pour brancher ces features, pas conçue pour.

- Appels téléphoniques
- Réservations (restaurant, RDV)
- Shopping / achats en ligne
- Gestion de voyage
- Veille informationnelle
- **OMI** (device enregistrement continu) — à explorer
- **iPhone 11** (écran cassé) — dédié à l'assistant
- **Mac Mini dédié** — déjà prévu dans l'infra

---

## 17. Stratégie de plan piloté par les tests

Le plan d'implémentation sera piloté par les 148 tests E2E. Chaque étape du plan
liste les IDs de tests qu'elle doit faire passer. Si un ID n'apparaît dans aucune
étape, c'est un trou. Objectif : traçabilité parfaite spec → plan → code → tests.

---

## 18. Tests E2E — 148 tests exhaustifs

### Stratégie technique — 3 niveaux

| Niveau | Outil | Quand lancer | Couvre |
|---|---|---|---|
| 🧪 **Vitest** | `pnpm test` | CI, chaque push | Backend: receiver, launcher, state manager, infra, locks, dedup |
| 🎭 **Playwright** | `pnpm test:e2e` | CI, chaque push | App web: UI, navigation, affichage, interactions |
| 🔥 **Smoke `/test`** | `/test <scénario>` | Fin d'implémentation, validation majeure | Flux complets cross-composants avec backend réel |

### Setup Vitest (unit + integration)

```bash
pnpm test                                    # tous les tests backend
pnpm test tests/receiver/webhook.test.ts     # fichier spécifique
pnpm test -t "E2E-RCV-01"                   # par ID E2E
```

**Principes** :
- Chaque test crée un workspace temporaire (`tmp/test-workspace-<random>/`)
- Claude est **mocké** : le launcher appelle une fonction mock
- Telegram est **mocké** : notifications capturées dans un tableau
- Les locks utilisent un dossier temporaire
- Cleanup automatique après chaque test

**Structure des fichiers de test** :
```
apps/backend/tests/
├── receiver/
│   ├── webhook.test.ts         # E2E-RCV-01, -02, -03, -08
│   ├── watchers.test.ts        # E2E-RCV-04, -05
│   ├── triage.test.ts          # E2E-RCV-06, -07
│   └── fixtures/
├── workspace/
│   ├── state.test.ts           # E2E-WS-04, -05, -10, -11
│   ├── checkpoint.test.ts      # E2E-WS-06, -07
│   ├── dossier.test.ts         # E2E-WS-01, -02, -03, -08, -09, -12, -13
│   └── fixtures/
├── launcher/
│   ├── session.test.ts         # E2E-LCH-01, -02, -03, -04, -07
│   ├── lifecycle.test.ts       # E2E-LCH-05, -06, -09, -10, -11
│   ├── sweep.test.ts           # E2E-LCH-08, E2E-CRN-01 à -06
│   └── fixtures/
├── hooks/
│   ├── pretooluse.test.ts      # E2E-GF-01 à -18
│   └── fixtures/
├── notifications/
│   ├── telegram.test.ts        # E2E-NTF-01 à -09
│   └── fixtures/
├── suggestions/
│   ├── suggestions.test.ts     # E2E-SUG-01 à -09
│   └── fixtures/
├── ameliorations/
│   ├── gaps.test.ts            # E2E-AML-01 à -04
│   └── fixtures/
├── session-lifecycle/
│   ├── idle-timeout.test.ts    # E2E-SLC-01 à -06
│   └── fixtures/
├── infra/
│   ├── locks.test.ts           # E2E-INF-01, -02
│   ├── audit.test.ts           # E2E-INF-03
│   ├── retry.test.ts           # E2E-INF-04
│   ├── dedup.test.ts           # E2E-INF-05
│   └── fixtures/
└── edge-cases/
    ├── edge-cases.test.ts      # E2E-EDGE-01 à -18
    └── fixtures/
```

### Setup Playwright (UI E2E)

```bash
pnpm test:e2e                   # tous les tests UI
pnpm test:e2e --ui              # mode debug
```

**Principes** :
- `globalSetup` lance backend en mode test + frontend Vite
- Backend sert un workspace de fixtures
- Tests sur 2 viewports : desktop (1280px) et mobile (375px)

```
apps/web/tests/e2e/
├── home.spec.ts                # E2E-APP-01 à -05
├── dossiers.spec.ts            # E2E-APP-06, -07, -23
├── dossier-detail.spec.ts      # E2E-APP-08 à -11, -28
├── terminal.spec.ts            # E2E-APP-12 à -14, -24
├── nouveau.spec.ts             # E2E-APP-15, -16
├── ameliorations.spec.ts       # E2E-APP-17, -18
├── responsive.spec.ts          # E2E-APP-19, -20
├── navigation.spec.ts          # E2E-APP-21, -27
├── realtime.spec.ts            # E2E-APP-22
├── empty-state.spec.ts         # E2E-APP-25, -26
└── fixtures/
```

### Setup Smoke `/test`

```bash
pnpm smoke:setup    # crée workspace de test
pnpm smoke:start    # lance backend + frontend en mode smoke
# Puis dans Claude Code : /test <scénario>
pnpm smoke:cleanup
```

---

### 18.1 RECEIVER — Réception et triage des events 🧪

**E2E-RCV-01** — Event Gmail → routing vers dossier existant
- Webhook Gmail reçoit email de `billing@soprasteria.com`
- Claude triage identifie `factures-sopra`, route l'event
- **Attendu** : event traité dans le contexte du dossier, state.md mis à jour

**E2E-RCV-02** — Event Gmail → pas de dossier → suggestion
- Email de `tax@cyprus.gov.cy`, aucun dossier ne matche
- **Attendu** : suggestion créée, PAS de dossier. Notification si urgent.

**E2E-RCV-03** — Event Gmail → déduplication
- Même webhook reçu 2 fois (retry Gmail)
- **Attendu** : hash déjà vu → event ignoré, pas de doublon

**E2E-RCV-04** — Event WhatsApp watcher → routing
- Message WhatsApp d'un acheteur, dossier `2ememain-bureau` existe
- **Attendu** : message traité, state.md mis à jour

**E2E-RCV-05** — Event SMS watcher → nouveau contact → suggestion
- SMS d'un numéro inconnu, aucun dossier ne matche
- **Attendu** : suggestion créée

**E2E-RCV-06** — Event multi-dossiers
- Email de la comptable concerne 2 dossiers
- **Attendu** : les 2 dossiers sont mis à jour, pas de duplication

**E2E-RCV-07** — Event spam / non pertinent
- Email marketing, aucun dossier, pas matière à suggestion
- **Attendu** : event ignoré

**E2E-RCV-08** — Event pour un dossier TERMINÉ
- Email pour un dossier au statut TERMINÉ
- **Attendu** : suggestion créée (pas de réouverture automatique)

---

### 18.2 WORKSPACE — État des dossiers 🧪

**E2E-WS-01** — Création de dossier via app web
- Lolo tape instruction, clique "Lancer"
- **Attendu** : dossier créé, session active, state.md avec objectif

**E2E-WS-02** — Création via approbation de suggestion
- Lolo clique "Créer le dossier" sur une suggestion
- **Attendu** : dossier créé avec contexte de la suggestion, suggestion supprimée

**E2E-WS-03** — Ignorer une suggestion
- **Attendu** : suggestion supprimée, aucun dossier créé

**E2E-WS-04** — State.md mis à jour après session
- Claude travaille, met à jour state.md
- **Attendu** : state.md reflète le travail fait

**E2E-WS-05** — State.md condensation
- state.md avec historique très long (>50 entrées)
- **Attendu** : Claude condense les anciennes entrées, info essentielle préservée

**E2E-WS-06** — Checkpoint.md création et détection
- Claude écrit checkpoint.md, hook détecte, notification envoyée
- **Attendu** : checkpoint visible dans l'UI avec résumé + "Ouvrir le terminal"

**E2E-WS-07** — Checkpoint.md supprimé après réponse
- Lolo répond, Claude continue et supprime checkpoint.md
- **Attendu** : checkpoint disparaît de l'UI

**E2E-WS-08** — Artifacts stockés dans le bon dossier
- Claude crée une facture PDF
- **Attendu** : fichier dans `workspace/<dossier>/artifacts/`, accessible dans l'app

**E2E-WS-09** — Dossier terminé
- Claude met `STATUT: TERMINÉ`, hook SessionEnd détecte
- **Attendu** : dossier "terminé" dans l'app, notification Telegram

**E2E-WS-10** — _inbox/events.md — events non rattachés
- Event non rattaché à aucun dossier, pas de suggestion
- **Attendu** : event loggé dans l'inbox

**E2E-WS-11** — Validation du format state.md
- App web parse `STATUT:` (EN COURS, TERMINÉ, BLOQUÉ)
- **Attendu** : statut correctement parsé et affiché

**E2E-WS-12** — Création de dossier avec fichier joint
- Instruction + 2 photos jointes
- **Attendu** : dossier créé, fichiers dans artifacts/, Claude les voit

**E2E-WS-13** — Upload de fichier vers un dossier existant
- Checkpoint demande des photos, Lolo upload via l'interface
- **Attendu** : Claude reçoit les fichiers et continue

---

### 18.3 LAUNCHER — Sessions Claude tmux 🧪

**E2E-LCH-01** — Lancement d'une session focalisée
- Event déclenche travail, lock créé, session tmux lancée
- **Attendu** : session active, lock créé, contexte chargé

**E2E-LCH-02** — Lock empêche session parallèle
- Dossier déjà locké, nouvel event arrive
- **Attendu** : pas de 2e session, event en attente

**E2E-LCH-03** — Sessions parallèles sur dossiers différents
- 2 events pour 2 dossiers différents
- **Attendu** : 2 sessions indépendantes, chacune avec son lock

**E2E-LCH-04** — Contexte minimal chargé
- **Attendu** : uniquement state.md + event + prompt système, pas d'autres dossiers

**E2E-LCH-05** — Détection fin de session (hook SessionEnd)
- Hook SessionEnd → lock supprimé, checkpoint vérifié, log audit
- **Attendu** : lock libéré, notification si checkpoint/terminé

**E2E-LCH-06** — Crash recovery
- Session crash, PID mort, lock présent
- **Attendu** : PID mort détecté, lock nettoyé, session relançable

**E2E-LCH-07** — Resume après timeout
- `claude --resume <session-id>` avec historique compacté
- **Attendu** : continuité conversationnelle

**E2E-LCH-08** — Sweep ignore les dossiers lockés
- **Attendu** : seuls les dossiers non lockés sont traités

**E2E-LCH-09** — Confirm mode
- Dossier avec "Valider avant actions externes"
- **Attendu** : action transformée en checkpoint au lieu d'exécutée

**E2E-LCH-10** — Réutilisation profil Camoufox
- Cookies de session toujours valides entre sessions
- **Attendu** : pas besoin de re-login

**E2E-LCH-11** — Event arrive pour dossier avec checkpoint en cours
- Dossier locké avec checkpoint
- **Attendu** : event stocké pour traitement ultérieur, pas de perte

---

### 18.4 GARDE-FOUS — Hooks PreToolUse 🧪

**E2E-GF-01** — Email safe → ALLOW
- gmail.reply() vers contact connu, contenu standard
- **Attendu** : ALLOW, email envoyé, audit trail

**E2E-GF-02** — Email avec montant anormal → DENY
- gmail.send() avec montant incohérent (120 000€ au lieu de 12 000€)
- **Attendu** : DENY, email non envoyé

**E2E-GF-03** — Email première interaction → ASK
- gmail.send() vers nouveau destinataire
- **Attendu** : ASK, notification Telegram, email en attente

**E2E-GF-04** — Browser click safe → ALLOW
- browser_click sur "Search button"
- **Attendu** : ALLOW, clic exécuté

**E2E-GF-05** — Browser click paiement → DENY
- browser_click sur "Confirm Payment button"
- **Attendu** : DENY, clic bloqué

**E2E-GF-06** — Browser fill_form financier → DENY
- browser_fill_form sur formulaire de virement
- **Attendu** : DENY

**E2E-GF-07** — Browser evaluate JS arbitraire
- browser_evaluate avec JS qui modifie le DOM
- **Attendu** : ALLOW si lecture, DENY si modification financière

**E2E-GF-08** — Bash avec curl POST → vérification
- Bash `curl -X POST https://api.external.com/...`
- **Attendu** : hook vérifie, ALLOW ou DENY selon cible

**E2E-GF-09** — Lecture seule Gmail → pas de hook
- gmail.search() ou gmail.read()
- **Attendu** : exécution directe

**E2E-GF-10** — Lecture seule browser → pas de hook
- browser_navigate ou browser_snapshot
- **Attendu** : exécution directe

**E2E-GF-11** — Opérations locales → pas de hook
- Read, Write, Grep, Glob
- **Attendu** : exécution directe

**E2E-GF-12** — PostToolUse audit trail
- gmail.send() ALLOW → PostToolUse → audit log
- **Attendu** : log avec timestamp, tool, params, session, résultat

**E2E-GF-13** — Hook timeout
- Mini-Claude met plus de 30s
- **Attendu** : timeout → DENY par sécurité

**E2E-GF-14** — Hook updatedInput — correction des paramètres
- gmail.send() avec typo destinataire → hook corrige
- **Attendu** : email envoyé avec paramètres corrigés

**E2E-GF-15** — Hook ASK → Lolo approuve
- **Attendu** : email envoyé, audit log, Claude continue

**E2E-GF-16** — Hook ASK → Lolo refuse
- **Attendu** : email NON envoyé, Claude s'adapte

**E2E-GF-17** — Hook ASK → timeout sans réponse
- **Attendu** : DENY par défaut, Claude informé

**E2E-GF-18** — Plusieurs hooks sur même appel
- gmail.send() matche 2 hooks PreToolUse
- **Attendu** : les 2 doivent ALLOW pour que l'action s'exécute

---

### 18.5 APP WEB — Interface 🎭

**E2E-APP-01** — Home affiche les checkpoints en attente
- 1 checkpoint + 1 MFA bloquant
- **Attendu** : section "Pour toi" avec 2 cartes + "Ouvrir le terminal"

**E2E-APP-02** — Home affiche les suggestions
- 2 suggestions dans `_suggestions/`
- **Attendu** : section "Suggestions" avec boutons "Créer le dossier" / "Ignorer"

**E2E-APP-03** — Home affiche les sessions actives
- 2 sessions tmux en cours
- **Attendu** : section "En fond" avec dot vert, durée

**E2E-APP-04** — Home activité récente + lien logs
- **Attendu** : derniers events, lien "Voir les logs complets"

**E2E-APP-05** — Home zen quand rien à faire
- **Attendu** : orbe, "Tout roule", sessions actives listées

**E2E-APP-06** — Dossiers — liste avec filtres
- **Attendu** : filtres Actifs/Terminés/Bloqués, recherche, "+ Nouveau"

**E2E-APP-07** — Dossiers — badge checkpoint
- **Attendu** : badge "1 checkpoint" sur la carte du dossier

**E2E-APP-08** — Dossier detail — state.md rendu
- **Attendu** : HTML lisible, pas markdown brut

**E2E-APP-09** — Dossier detail — checkpoint résumé
- **Attendu** : bannière avec résumé + "Ouvrir le terminal"

**E2E-APP-10** — Dossier detail — sidebar
- **Attendu** : statut session, fichiers, historique

**E2E-APP-11** — Dossier detail — barre d'instruction
- **Attendu** : instruction envoyée, session lancée ou notifiée

**E2E-APP-12** — Terminal — onglets de sessions
- **Attendu** : 3 onglets nommés par dossier, indicateur de statut

**E2E-APP-13** — Terminal — interaction tmux
- **Attendu** : input envoyé, Claude répond, terminal temps réel

**E2E-APP-14** — Terminal — barre de statut
- **Attendu** : nom dossier, numéro tmux, durée idle, statut

**E2E-APP-15** — Nouveau — créer un dossier
- **Attendu** : dossier créé, session lancée, redirection

**E2E-APP-16** — Nouveau — recommandations en dessous
- **Attendu** : suggestions affichées sous le formulaire

**E2E-APP-17** — Améliorations — liste des limites
- **Attendu** : cartes avec titre, description, impact, suggestion

**E2E-APP-18** — Améliorations — filtrer ouvertes/résolues
- **Attendu** : filtre fonctionne

**E2E-APP-19** — PWA responsive — mobile
- **Attendu** : tab bar en bas, contenu adapté

**E2E-APP-20** — PWA responsive — desktop
- **Attendu** : icon rail à gauche, avatar en bas

**E2E-APP-21** — Navigation Home → Dossier → Terminal
- **Attendu** : navigation fluide, bon dossier/session ciblé

**E2E-APP-22** — Mises à jour temps réel (SSE)
- **Attendu** : Home se met à jour sans refresh

**E2E-APP-23** — Recherche de dossier
- **Attendu** : filtre par texte fonctionne

**E2E-APP-24** — Terminal sur mobile
- **Attendu** : terminal fonctionnel (scroll, input)

**E2E-APP-25** — Urgence visuelle des suggestions
- **Attendu** : bordure rouge/jaune/grise, urgentes en premier

**E2E-APP-26** — État vide / premier lancement
- **Attendu** : Home zen, Dossiers vide avec message d'accueil, pas de crash

**E2E-APP-27** — Navigation Telegram → app web
- **Attendu** : lien ouvre la bonne page (pas la Home générique)

**E2E-APP-28** — Instruction bar + mode confirm
- **Attendu** : instruction avec flag confirm, session en mode confirm

---

### 18.6 NOTIFICATIONS — Telegram 🧪

**E2E-NTF-01** — Checkpoint → notification Telegram
- **Attendu** : message avec lien vers l'app web

**E2E-NTF-02** — MFA bloquant → notification
- **Attendu** : "Bloqué sur exali.com (MFA) → [Intervenir]"

**E2E-NTF-03** — Dossier terminé → notification
- **Attendu** : "Dossier 'Comptable belge' terminé"

**E2E-NTF-04** — Suggestion urgente → notification
- **Attendu** : notification avec lien

**E2E-NTF-05** — Suggestion normale → PAS de notification
- **Attendu** : visible dans l'app uniquement

**E2E-NTF-06** — Action externe loggée → notification informative
- **Attendu** : "Relance envoyée à Sopra"

**E2E-NTF-07** — Notification contient un lien vers l'app
- **Attendu** : lien cliquable vers page pertinente

**E2E-NTF-08** — Échec d'envoi → retry
- **Attendu** : retry avec backoff (3 tentatives max)

**E2E-NTF-09** — Anti-spam notifications
- 20 events en 30 secondes
- **Attendu** : notifications groupées ou rate-limitées

---

### 18.7 SUGGESTIONS 🧪

**E2E-SUG-01** — Suggestion créée par triage event
- (Couvert par E2E-RCV-02)

**E2E-SUG-02** — Suggestion créée par sweep
- **Attendu** : suggestion avec source "Sweep", urgence, résumé

**E2E-SUG-03** — Suggestion en travaillant sur un autre dossier
- **Attendu** : suggestion créée, travail principal continue

**E2E-SUG-04** — Format suggestion complet
- **Attendu** : URGENCE, SOURCE, DATE, Résumé, Pourquoi, Ce que je ferais

**E2E-SUG-05** — Suggestion approuvée → dossier + session
- (Couvert par E2E-WS-02)

**E2E-SUG-06** — Suggestion ignorée → supprimée
- (Couvert par E2E-WS-03)

**E2E-SUG-07** — Pas de suggestion dupliquée
- **Attendu** : pas de 2e suggestion pour le même sujet

**E2E-SUG-08** — Suggestion approuvée avec instructions personnalisées
- Lolo ajoute une instruction en approuvant
- **Attendu** : state.md contient résumé de la suggestion + instruction de Lolo

**E2E-SUG-09** — Sweep crée plusieurs suggestions
- **Attendu** : suggestions distinctes, slugs uniques

---

### 18.8 AMÉLIORATIONS (Gaps) 🧪

**E2E-AML-01** — Claude détecte une limite
- **Attendu** : nouvelle entrée dans gaps.md

**E2E-AML-02** — Limite visible dans l'app
- **Attendu** : cartes avec titre, description, impact, suggestion

**E2E-AML-03** — Marquer comme résolue
- **Attendu** : entrée marquée résolue, filtrée par défaut

**E2E-AML-04** — Pas de doublon
- **Attendu** : une seule entrée pour le même problème

---

### 18.9 SESSION LIFECYCLE — Idle, timeout, resume 🧪

**E2E-SLC-01** — Claude idle → hook idle_prompt → notification
- **Attendu** : notification envoyée, timer actif (1h)

**E2E-SLC-02** — Lolo répond avant timeout → prochain hook annule le timer
- Mécanisme : n'importe quel hook (PreToolUse, Stop, PostToolUse) de la session idle → `cancelIdleTimer()`
- **Attendu** : session continue, timer annulé, statut repasse à `active`

**E2E-SLC-03** — Timeout expiré → sauvegarde et fin
- Backend envoie `tmux send-keys` "Timeout, sauvegarde"
- **Attendu** : state.md à jour, session terminée, lock libéré, session_id sauvé

**E2E-SLC-04** — Resume après timeout
- `claude --resume <session-id>`
- **Attendu** : Claude reprend avec historique compacté

**E2E-SLC-05** — Hook Stop détecte fin de réponse
- **Attendu** : hook détecte la fin, backend vérifie l'état

**E2E-SLC-06** — Session.id persisté
- **Attendu** : `workspace/<dossier>/.session-id` existe avec le bon ID

**E2E-SLC-07** — Crash recovery → sessions tmux réconciliées
- Backend redémarre, tmux a des sessions `alfred-*` actives
- **Attendu** : sessions reconstruites dans la Map, hooks fonctionnent à nouveau

**E2E-SLC-08** — Crash recovery → locks stales nettoyés
- Backend redémarre, lock file avec PID mort dans `/tmp/assistant-locks/`
- **Attendu** : lock supprimé, dossier disponible

---

### 18.10 CRON SWEEP 🧪

**E2E-CRN-01** — Sweep lance des sessions focalisées
- 3 dossiers, 2 ont besoin d'action
- **Attendu** : 2 sessions lancées, 3e ignoré

**E2E-CRN-02** — Sweep skip les dossiers lockés
- (Couvert par E2E-LCH-08)

**E2E-CRN-03** — Sweep détecte deadline proche
- **Attendu** : session lancée pour avancer

**E2E-CRN-04** — Sweep détecte relance à faire
- "Relancer si pas de réponse avant le 16/03", on est le 17/03
- **Attendu** : session lancée, relance envoyée

**E2E-CRN-05** — Sweep crée des suggestions
- Emails non traités détectés
- **Attendu** : suggestions créées

**E2E-CRN-06** — Sweep quand rien à faire
- **Attendu** : pas de session lancée, log "rien à faire"

---

### 18.11 INFRASTRUCTURE 🧪

**E2E-INF-01** — Resource lock — browser parallèle
- 2 sessions avec 2 profils Camoufox
- **Attendu** : parallélisme total (profils isolés)

**E2E-INF-02** — Lock PID — process mort nettoyé
- **Attendu** : pas de blocage permanent

**E2E-INF-03** — Audit trail complet
- **Attendu** : chaque action externe loggée avec timestamp, tool, params, résultat

**E2E-INF-04** — Retry/backoff sur erreur Claude
- Erreur 429 → backoff exponentiel
- **Attendu** : session reprend, pas de crash

**E2E-INF-05** — Dedup event par content hash
- (Couvert par E2E-RCV-03)

---

### 18.12 FLUX COMPLETS END-TO-END 🔥

**Pré-requis** :
```bash
pnpm smoke:setup
pnpm smoke:start
```

**E2E-FULL-01** — Email → dossier existant → action → audit
```
/test Envoie un webhook Gmail POST /api/webhook/gmail avec un email de billing@soprasteria.com
(sujet: "Timesheet juin"). Vérifie que :
1. Le backend accepte le webhook (200)
2. Le fichier workspace/factures-sopra/state.md est modifié
3. Une session tmux "factures-sopra" existe
4. Le fichier workspace/_audit/actions.log contient une entrée récente
5. L'app web sur / affiche une session active pour "factures-sopra"
```

**E2E-FULL-02** — Email nouveau → suggestion → approbation → travail
```
/test Envoie un webhook Gmail POST /api/webhook/gmail avec un email de tax@cyprus.gov.cy
(sujet: "Tax declaration deadline"). Vérifie que :
1. Aucun dossier "impots-chypre" n'est créé dans workspace/
2. Un fichier workspace/_suggestions/impots-chypre*.md existe avec URGENCE: urgent
3. L'app web sur / affiche la suggestion
4. Clique sur "Créer le dossier"
5. Vérifie qu'un dossier workspace/impots-chypre/ existe avec un state.md
6. La suggestion a été supprimée
7. L'app web sur /dossiers affiche le nouveau dossier
```

**E2E-FULL-03** — Instruction Lolo → dossier → checkpoint
```
/test Dans l'app web, va sur /nouveau. Tape "Rapport exali annuel 2025"
et clique "Lancer". Vérifie que :
1. Un dossier workspace/rapport-exali*/ est créé avec un state.md
2. L'app redirige vers la page du dossier
3. Le state.md contient l'objectif "Rapport exali"
4. Une session tmux existe pour ce dossier
5. Un lock existe dans /tmp/assistant-locks/
```

**E2E-FULL-04** — Sweep → deadline → travail autonome
```
/test Vérifie le workspace : exali-rapport/ a un state.md avec deadline dans 3 jours.
Déclenche un sweep via POST /api/sweep. Vérifie que :
1. Une session tmux est lancée pour exali-rapport
2. Le state.md est mis à jour après traitement
3. L'app web montre une session active dans "En fond"
```

**E2E-FULL-05** — Sweep → rien à faire → silence
```
/test Vérifie que tous les dossiers sont TERMINÉ ou à jour.
Déclenche un sweep via POST /api/sweep. Vérifie que :
1. Aucune nouvelle session tmux
2. Aucune notification (GET /api/notifications/recent → vide)
3. L'app web affiche le mode zen
```

**E2E-FULL-06** — Hook DENY → Claude s'adapte
```
/test Vérifie qu'une session active existe. Vérifie que si Claude tente
une action bloquée (gmail.send vers inconnu), le hook retourne DENY. Vérifie que :
1. workspace/_audit/actions.log contient une entrée DENY
2. Un checkpoint.md est créé
3. L'app web affiche le checkpoint dans "Pour toi"
4. Le bouton "Ouvrir le terminal" est présent
```

**E2E-FULL-07** — Timeout idle → resume → continuation
```
/test Vérifie qu'un dossier a un checkpoint.md et un .session-id.
Simule un timeout via POST /api/session/<id>/timeout. Vérifie que :
1. Le state.md est mis à jour
2. Le lock est libéré
3. Le .session-id est préservé
4. Déclenche un resume via POST /api/dossier/<id>/resume
5. Une nouvelle session tmux avec --resume
6. L'app web montre la session active
```

**E2E-FULL-08** — 3 sessions parallèles
```
/test Crée 3 dossiers via /nouveau : "Test A", "Test B", "Test C". Vérifie que :
1. 3 dossiers dans workspace/
2. 3 sessions tmux distinctes
3. 3 locks PID distincts
4. L'app web affiche 3 sessions actives
5. Chaque dossier a son propre state.md
```

**E2E-FULL-09** — Claude découvre un gap
```
/test Vérifie qu'un dossier a une session active. Après le travail, vérifie que :
1. workspace/_gaps/gaps.md contient une nouvelle entrée
2. Un checkpoint.md existe
3. L'app /ameliorations affiche la nouvelle entrée
4. L'app / affiche le checkpoint dans "Pour toi"
5. Les deux sont indépendants
```

**E2E-FULL-10** — Claude ne crée jamais de dossier seul
```
/test Envoie 5 webhooks Gmail différents. Aucun dossier existant ne matche. Vérifie que :
1. AUCUN nouveau dossier créé dans workspace/
2. Des suggestions dans workspace/_suggestions/ (au moins 3)
3. L'app / affiche les suggestions, pas des dossiers
4. Chaque suggestion a URGENCE, SOURCE, Résumé
```

**E2E-FULL-11** — Échange de fichiers Lolo ↔ Claude
```
/test Ouvre un dossier avec checkpoint demandant des photos. Vérifie que :
1. Upload 2 images via le formulaire
2. Fichiers dans workspace/<dossier>/artifacts/
3. Fichiers listés dans la sidebar
4. Resume de la session
5. state.md mentionne les fichiers reçus
```

**E2E-FULL-12** — Premier lancement — workspace vide
```
/test Supprime workspace/*. Redémarre le backend. Ouvre l'app. Vérifie que :
1. Pas de crash
2. Home zen
3. /dossiers vide avec message d'accueil
4. Créer un dossier "Premier test"
5. Dossier créé, structure complète
6. Retour sur / → dossier dans "En fond"
```

**E2E-FULL-13** — Backend restart avec sessions en cours
```
/test Note les sessions tmux actives. Redémarre le backend. Vérifie que :
1. Sessions tmux toujours actives
2. Locks cohérents avec les sessions
3. L'app affiche les sessions correctement
4. Aucun lock orphelin
```

---

### 18.13 EDGE CASES 🧪

**E2E-EDGE-01** — Event arrive pendant un sweep
- **Attendu** : event traité indépendamment du sweep

**E2E-EDGE-02** — Dossier même nom qu'une suggestion
- **Attendu** : dossier créé, suggestion auto-nettoyée

**E2E-EDGE-03** — Checkpoint mais session crash avant notification
- **Attendu** : checkpoint détecté au prochain sweep/event

**E2E-EDGE-04** — State.md corrompu / vide
- **Attendu** : Claude reconstitue via session-id/historique, signale le problème

**E2E-EDGE-05** — Plusieurs checkpoints en même temps
- **Attendu** : 3 checkpoints affichés dans "Pour toi"

**E2E-EDGE-06** — Rate limit Claude Max
- **Attendu** : backoff, retry, session en attente

**E2E-EDGE-07** — Webhook flood (100 emails en 1 minute)
- **Attendu** : dedup filtre, pas de crash, pas de sessions infinies

**E2E-EDGE-08** — Lolo modifie state.md manuellement
- **Attendu** : Claude s'adapte aux changements

**E2E-EDGE-09** — Suggestion pour dossier qui vient d'être créé
- **Attendu** : suggestion obsolète, events futurs routés vers le dossier

**E2E-EDGE-10** — Dossier sans session depuis 2 semaines
- **Attendu** : sweep lance une session pour vérifier pertinence

**E2E-EDGE-11** — Hook DENY en boucle
- **Attendu** : après N tentatives, checkpoint au lieu de boucler

**E2E-EDGE-12** — Camoufox profil corrompu
- **Attendu** : Claude signale dans gaps.md

**E2E-EDGE-13** — Lock stale détecté par le sweep
- **Attendu** : lock nettoyé, dossier disponible

**E2E-EDGE-14** — Checkpoint.md malformé ou vide
- **Attendu** : notification dégradée, pas de crash backend

**E2E-EDGE-15** — Double-clic "Créer le dossier" (concurrence)
- **Attendu** : 1 seul dossier, 2e requête ignorée

**E2E-EDGE-16** — State.md avec statut non reconnu
- **Attendu** : affichage dégradé (statut "inconnu"), pas de crash

**E2E-EDGE-17** — Erreur disque pendant écriture
- **Attendu** : erreur détectée, notification d'alerte

**E2E-EDGE-18** — Backend restart avec locks orphelins
- **Attendu** : locks PID morts nettoyés au boot, PID vivants conservés
