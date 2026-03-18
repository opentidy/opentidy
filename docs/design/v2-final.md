# Assistant Personnel V2 — Architecture & Décisions

**Document de référence consolidé.**
Toute la réflexion V2 est condensée ici. Les autres fichiers du dossier `docs/v2-rethink/`
sont l'historique de la réflexion — ce document est la version finale.

---

## 1. Vision

Un assistant personnel qui tourne 24/7, capable de gérer des dossiers administratifs
en autonomie. Il travaille méthodiquement en fond, ne dérange l'utilisateur que quand c'est
nécessaire, et s'améliore au fil du temps.

### Ce que V1 a prouvé

L'utilisateur a commencé par le skill `/comptable` — facturation, timesheets, dépenses. En
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
Personne ne remarque si une facture est envoyée 2 minutes plus tard.

**Conséquences** : pas d'optimisation de latence, pas de queue avec priorités
ultra-fines. On se concentre sur la qualité des résultats. Si un triage Claude
prend 30 secondes, c'est acceptable.

**Exception** : l'usage interactif direct (l'utilisateur dans un terminal Claude Code) — là
c'est du live, mais c'est géré nativement.

### Principe 2 — Claude Code est le moteur d'exécution

Tout le travail est fait par Claude Code, qui utilise Claude Max (abonnement fixe).

**Pourquoi** : Claude Code a déjà tout l'écosystème — skills, MCP servers, browser
automation, accès système macOS, session resume. Reconstruire ça avec l'API ou
l'Agent SDK coûterait des semaines de travail pour un résultat équivalent. Le choix
de Claude Max plutôt que l'API est aussi économique (abonnement fixe vs tokens),
mais la vraie raison c'est l'écosystème existant.

### Principe 3 — Le budget n'est pas une contrainte

Pas de compromis d'architecture pour économiser des tokens ou des ressources. On
peut lancer plusieurs sessions en parallèle. Les limites pratiques de Claude Max
(rate limits, parallélisme) restent à évaluer empiriquement, mais le budget
monétaire n'est pas un frein.

### Principe 4 — L'intelligence est dans Claude, pas dans le code

Le code backend ne contient PAS de logique métier, de triage, de décision, de
routing intelligent. Il fait de la plomberie : recevoir events, lancer Claude,
persister l'état. Claude décide quoi faire, comment, dans quel ordre.

**Origine** : en analysant la V1, on a réalisé que ~3000 lignes de TypeScript
réimplémentent ce que Claude fait déjà. On a proposé des CLIs custom comme
`invoice list --missing` — l'utilisateur a fait remarquer que c'est "programmer ce que Claude
est déjà capable de faire." Les outils sont des ponts vers les services (chercher,
envoyer, lister), la logique métier c'est Claude.

**Nuance** : certaines fonctions backend NE SONT PAS de l'intelligence — dédup
events, resource locks, retry/backoff, audit trail, crash recovery. C'est de
l'infrastructure, pas de la décision. Ça reste dans le code.

### Principe 5 — Pas d'interruption — parallélisme isolé

Si Claude travaille sur une facture, il finit. Un event urgent ne l'interrompt
pas — il lance une nouvelle session parallèle. Chaque Claude a son propre espace
et ses propres ressources. Les conflits de ressources (Chrome, etc.) sont gérés
par les locks (mécanisme V1, déjà fonctionnel).

### Principe 6 — L'assistant tourne en fond, tranquillement

Pas de réactivité à la seconde. L'assistant travaille méthodiquement, vérifie
régulièrement, avance sur les dossiers, et ne dérange l'utilisateur que quand c'est nécessaire.

**Modèle retenu** : hybride events + crons.
- Event-driven pour les stimuli externes (webhook Gmail, message Telegram)
- Cron périodique pour le travail de fond ("vérifie les dossiers, avance ce qui
  peut avancer, relance ce qui doit l'être")
- La fréquence de cron exacte est un détail d'implémentation (15min ? 1h ?)

**Pourquoi pas les autres modèles** : polling pur gaspille quand rien ne se passe.
Event-driven pur ne gère pas le travail de fond proactif, les relances ("ça fait
3 jours que Sopra n'a pas répondu"), ni les deadlines qui approchent.

### Principe 7 — Actions rapides/interactives = outil spécialisé

Si un cas d'usage demande de la réactivité ou de l'interactivité (conversations
temps réel, réservations en live, appels téléphoniques), c'est un outil/skill
spécialisé que l'assistant appelle quand il en a besoin — pas le système principal.
Ça garde le système principal simple et méthodique.

### Principe 8 — Amélioration continue

L'assistant n'a pas besoin d'être parfait au jour 1. Quand Claude n'arrive pas à
faire quelque chose, il reporte le gap dans un fichier `workspace/_gaps/gaps.md` :
"Pour faire X, j'aurais besoin de Y." L'utilisateur consulte ce fichier pour décider quoi
ajouter (nouveau skill, nouveau MCP, etc.). C'est un backlog naturel d'améliorations,
généré par l'usage réel.

---

## 3. Décision structurante : le contexte est fini

### Le raisonnement

On a d'abord pensé en termes d'agents spécialisés (compta, admin, social) — Approche D.
L'utilisateur a fait remarquer que Claude est déjà généraliste et peut choisir les bons skills
lui-même. La spécialisation par domaine n'apporte pas grand-chose.

On a ensuite pensé à un agent unique qui gère un "bureau" — Approche C. Mais un seul
agent = un seul contexte = goulot d'étranglement. Si Claude travaille sur les factures
et qu'un email urgent arrive, il fait quoi ? Et le contexte grandit avec chaque dossier
→ dilution, dérive.

**Le vrai problème technique n'est ni la capacité ni la vitesse — c'est que le contexte
de Claude est fini.** On ne peut pas lui donner l'état de tous les dossiers + tous les
emails + tous les messages + toutes les tâches. Même si ça rentre, la qualité se dégrade
quand le contexte est trop chargé (dégradation qui accélère après 75% d'utilisation —
recherche Google ADK / Vincent van Deth).

### La solution : sessions focalisées par dossier

Pas d'agents spécialisés par domaine. Un seul type d'agent : un Claude Code chargé
avec le bon contexte pour un dossier précis.

- Claude travaille sur "factures Sopra" → chargé avec : état du dossier, infos Sopra,
  accès Gmail. C'est tout.
- Claude répond à la comptable → chargé avec : l'email, les docs concernés. C'est tout.
- Claude remplit le rapport exali → chargé avec : état du dossier, credentials, browser.

Le même Claude, juste des contextes différents. Quand il a fini (ou quand il a besoin
de l'utilisateur), il sauvegarde son état et se termine. Session propre à chaque fois.

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
│  Interface principale de l'utilisateur :                            │
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
│  │  Push → l'utilisateur (liens vers app web)  │                    │
│  └─────────────────────────────────────────┘                       │
│                                                                    │
└────────────────────────┬───────────────────────────────────────────┘
                         │ lance
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│               SESSIONS CLAUDE CODE (tmux)                          │
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
│  Session 3: "demande-comptable-mars"                               │
│    contexte: workspace/demande-comptable-mars/state.md             │
│    outils: Gmail MCP, fichiers                                     │
│                                                                    │
│  (N sessions en parallèle, isolées)                                │
│                                                                    │
│  Chaque session :                                                  │
│  1. Lit state.md (où j'en suis)                                    │
│  2. Lit l'event/instruction déclencheur                            │
│  3. Travaille (skills, MCP, browser)                               │
│     → les hooks vérifient chaque action sensible                   │
│  4. Met à jour state.md                                            │
│  5. Si besoin de l'utilisateur → checkpoint.md + termine            │
│  6. Si fini → état "terminé" + termine                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

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
| Instruction utilisateur | App web | "Mets le bureau en vente sur 2ememain" |
| Instruction utilisateur | Claude Code interactif | L'utilisateur travaille directement |
| Instruction utilisateur | Telegram | Réponse à un checkpoint |

**Format uniforme** : source, contenu, timestamp, métadonnées (expéditeur, etc.).

**Triage / routing** : quand un event arrive, qui décide quel dossier il concerne ?

Décision : Claude fait le triage (principe #4 — intelligence dans Claude, pas le code).
Le receiver donne l'event à un Claude qui décide :
- **Dossier existant** → route l'event vers le dossier, le travail continue en autonomie
- **Pas de dossier existant** → crée une **suggestion** (pas un dossier)

**Règle fondamentale : Claude ne crée jamais de dossier lui-même.** Seul l'utilisateur peut
créer un dossier (via l'app web) ou approuver une suggestion de Claude. C'est le
point de contrôle principal : rien ne démarre sans le feu vert de l'utilisateur. Sans ça,
l'assistant peut partir en roue libre pendant une absence (vacances, week-end).

Pour commencer, chaque event = une session Claude (même les spams). On optimise
après si trop de sessions inutiles sont lancées (ex: triage Claude rapide avant le
worker complet).

### 5.2 WORKSPACE — état des dossiers

Chaque dossier en cours a un répertoire dans `workspace/` avec des fichiers markdown.
Pas de base de données pour l'état — des fichiers lisibles par l'humain ET par Claude.

```
workspace/
├── factures-2025/
│   ├── state.md          # état actuel, prochaines étapes, historique condensé
│   ├── checkpoint.md     # si en attente de l'utilisateur : quoi, pourquoi, options
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
pour reprendre le travail dans une nouvelle session, sans rien d'autre en contexte.

```markdown
# Factures Sopra 2025-2026

## Objectif
Vérifier que toutes les factures mensuelles Sopra ont été envoyées.
Une facture par mois, basée sur les timesheets.

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
- Réponse de Sopra pour le timesheet de mai (relancer si pas de réponse avant le 16/03)

## Contacts
- Sopra billing: billing@soprasteria.com

## Notes
- Taux: 80€/h HT, devise EUR
- Format facture: utiliser /comptable avec template Sopra
```

**Condensation** : Claude gère lui-même la taille de state.md (principe #4 —
intelligence dans Claude). S'il y a trop d'historique, il condense les anciennes
entrées ("Jan-Mar 2025: toutes envoyées ✓"). Une instruction dans le prompt système
lui demande de garder state.md concis.

#### Le fichier checkpoint.md

Quand Claude a besoin de l'utilisateur (question, validation, info manquante), il écrit
un checkpoint. L'app web le présente et permet à l'utilisateur de répondre.

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

Lance des sessions Claude Code dans des terminaux tmux avec le bon contexte.

**Détection d'état — hooks centralisés** : tous les hooks `type: "command"` appellent
un endpoint unique `POST /api/hooks` sur le backend. Pas de file watching, pas de polling.
Les hooks système firent automatiquement, la détection ne dépend pas d'une instruction à Claude.

| Hook | Signal | Action backend |
|---|---|---|
| `idle_prompt` | Claude attend un input | `tmux capture-pane` → notification + SSE |
| `SessionEnd` | Session terminée | Cleanup lock, check state.md, notification + SSE |
| `Stop` | Claude arrête de générer | Check état, push SSE |
| `PostToolUse` | Action exécutée | Audit log |

**Checkpoint.md** : optionnel (best-effort). Si Claude l'écrit → résumé structuré dans l'app.
Sinon → fallback sur `tmux capture-pane` (dernières lignes du terminal). La détection
d'un Claude bloqué repose sur le hook `idle_prompt`, pas sur checkpoint.md.

**Mode retenu : tmux** (pas `claude -p`).

Pourquoi tmux et pas print :
- Le browser reste ouvert quand Claude attend (état préservé : cookies, page, formulaire)
- L'utilisateur peut voir/intervenir via le terminal intégré dans l'app web (accessible
  depuis téléphone, Windows, n'importe quel appareil)
- Les hooks PreToolUse fonctionnent dans les sessions tmux interactives
- Déjà implémenté et éprouvé en V1

Pourquoi pas `claude -p` :
- Pas d'interaction mid-session (problème fatal pour MFA/captcha)
- Perte de l'état browser à chaque reprise
- Les actions non-reproductibles (formulaire changé, session expirée)

**Contexte chargé dans chaque session** :
1. Le fichier state.md du dossier (où j'en suis)
2. L'event ou l'instruction qui a déclenché la session
3. Un prompt système minimal ("tu es l'assistant personnel, voici les règles")

C'est tout. Pas de contexte global, pas de tous-les-dossiers. Session focalisée.

**Parallélisme** : plusieurs sessions tmux en même temps, chacune sur un dossier
différent. Locks de dossier (PID, `/tmp/opentidy-locks/`) pour empêcher deux
sessions de travailler sur le même dossier. Le sweep ignore les dossiers lockés.

**Browser : Camoufox** (pas Chrome/Playwright). Chaque session a sa propre instance
Camoufox avec un profil isolé (via le skill `/browser`). Avantages :
- Parallélisme total — plus de lock browser entre agents
- Anti-détection (pas détecté comme bot par les sites)
- Sessions persistantes par profil (cookies, login conservés entre sessions)
- L'utilisateur garde Chrome pour lui, aucune interférence

Le nombre de sessions parallèles est limité par les quotas Claude Max — à découvrir
empiriquement.

### 5.4 GARDE-FOUS — hooks PreToolUse (APPROCHE VALIDÉE)

C'est le composant le plus critique. Claude a accès à tout : emails, banque,
factures, browser. Une erreur a des conséquences réelles.

#### Le problème fondamental

Le cas le plus dangereux : Claude est CONFIANT mais a TORT. Il ne va pas déclencher
ses propres garde-fous parce qu'il pense que tout va bien.

Stats clés :
- Si un agent a 85% de précision par action, un workflow de 10 étapes ne réussit
  que 20% du temps (erreurs composées)
- CMU 2025 : les LLMs restent confiants même quand ils se trompent (49.71% accuracy
  avec 39.25% calibration error). RLHF aggrave le problème.
- Incident Replit 2025 : un agent a `DROP DATABASE` en prod puis généré des faux logs
- Amazon Kiro : 13h de downtime causé par un agent sans observabilité
- Gartner : 40%+ des projets agentic AI seront abandonnés d'ici 2027

#### Pourquoi les approches classiques ne suffisent pas

| Approche | Problème |
|---|---|
| Checkpoint avant chaque action | Tue l'autonomie. C'est l'utilisateur qui fait le boulot. |
| Règles d'outils (`--allowedTools`) | Claude contourne via browser/bash. Restreindre les outils le pousse à hacker le système — il vaut mieux qu'il utilise les bons outils. |
| Claude évalue le risque lui-même (prompts) | Il ne suit pas les consignes ~50% du temps. Le cas dangereux c'est quand il se trompe dans son évaluation. |
| Checks programmatiques | Trop rigides. Si Claude doit contacter un nouveau service, il est bloqué. |
| Double-check par 2ème Claude | Comment FORCER Claude à appeler le vérificateur ? Si c'est dans le prompt, il ne le fera pas systématiquement. |
| Délai systématique | "Pourquoi Claude serait meilleur en attendant 5 minutes ?" Si l'utilisateur ne voit pas la notif, l'action part quand même. |

#### La solution : hooks PreToolUse `type: "prompt"`

Claude Code a des **hooks PreToolUse** — du code qui s'exécute automatiquement,
côté SYSTÈME, avant chaque appel d'outil. Ce n'est PAS une instruction à Claude.
C'est du code dans le runtime. Claude ne les appelle pas, ne peut pas les skipper,
ne sait même pas qu'ils existent.

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
Si ASK   → l'utilisateur est notifié et doit approuver
```

**Le game changer** : le hook `type: "prompt"` est un mini-Claude vérificateur
INTÉGRÉ dans le système de hooks. Pas de subprocess à spawner. Pas de code custom.
Juste un prompt dans la config :

```json
{
  "type": "prompt",
  "prompt": "Vérifie cette action. Est-elle safe ? Règles : ne jamais faire de
    paiement sans approbation, vérifier la cohérence des montants, signaler les
    anomalies. Réponds ALLOW ou DENY avec la raison.",
  "timeout": 30
}
```

Ce mini-Claude a son propre contexte séparé. Ce n'est PAS la même session qui
s'auto-vérifie — c'est une évaluation indépendante.

**Le problème du browser résolu** : pour les actions Playwright, le hook reçoit
un champ `element` avec une DESCRIPTION textuelle de ce qui est cliqué ("Confirm
Payment button", "Search button", "Submit form"). Le mini-Claude peut distinguer
les clics safe des clics dangereux.

#### Configuration concrète

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__gmail__reply|mcp__gmail__draft",
        "hooks": [{
          "type": "prompt",
          "prompt": "Vérifie cet envoi d'email. Règles : ne jamais faire de
            paiement sans approbation, vérifier la cohérence des montants et
            destinataires, signaler toute anomalie.",
          "timeout": 30
        }]
      },
      {
        "matcher": "mcp__plugin_playwright_.*__browser_(click|fill_form|evaluate|run_code)",
        "hooks": [{
          "type": "prompt",
          "prompt": "L'agent clique sur un élément du browser. Regarde l'élément
            et l'URL. Si c'est un bouton de paiement, de soumission de formulaire
            financier, ou de confirmation irréversible, DENY. Sinon ALLOW.",
          "timeout": 10
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__plugin_playwright_.*",
        "hooks": [{
          "type": "command",
          "command": "node /path/to/audit-logger.js",
          "timeout": 5
        }]
      }
    ]
  }
}
```

#### Les 4 règles ADN

1. **Toute action irréversible → humain** (hook ASK)
2. **Toute action externe → vérifiée avant exécution** (hook ALLOW/DENY)
3. **Toute anomalie détectée → signalée** (hook + notification)
4. **Tout est loggé → réparable après coup** (PostToolUse audit trail)

#### Ce que les hooks couvrent

| Outil | Hook ? | Timeout | Justification |
|---|---|---|---|
| Gmail send/reply/draft | Oui (prompt) | 30s | Actions irréversibles vers l'extérieur |
| Camoufox click/fill_form | Oui (prompt) | 10s | Peut déclencher paiements/soumissions |
| Camoufox evaluate/run_code | Oui (prompt) | 10s | Exécution JS arbitraire |
| Bash (patterns réseau) | Oui (command) | 10s | curl POST, ssh, scp = actions externes |
| Gmail search/read | Non | — | Lecture seule, zéro risque |
| Camoufox navigate/snapshot | Non | — | Navigation/lecture, zéro risque |
| Read/Grep/Glob/Write interne | Non | — | Opérations locales, zéro risque |

#### Limites honnêtes

1. **Le mini-Claude peut aussi se tromper** — mais deux Claude indépendants qui se
   trompent de la même manière c'est moins probable qu'un seul
2. **Le browser reste le point le plus faible** — le champ `element` aide beaucoup
   mais "Submit" ne dit pas toujours ce qui est soumis. Compensé par la supervision
   tmux et l'audit trail.
3. **Le ralentissement browser** — 10s par clic significatif. Acceptable vu que la
   vitesse n'est pas un critère (principe #1), mais à monitorer.
4. **Les hooks prompt utilisent du contexte Claude** — à monitorer pour l'impact
   sur les limites Claude Max.
5. **Les cas non anticipés** — aucun système ne couvre 100%. Le filet ultime c'est
   l'audit trail + la réparabilité (concept Reversible Autonomy : accepter l'erreur,
   la rendre détectable et réparable).

### 5.5 APP WEB — interface principale de l'utilisateur

L'app web remplace le combo Telegram+Dashboard de V1 comme interface principale.

**Vues principales** :

| Vue | Contenu |
|---|---|
| Tableau de bord | Dossiers en cours + statut, actions en attente, suggestions, sessions actives, activité récente (avec lien vers les logs complets) |
| Dossier | État détaillé (state.md rendu), historique, checkpoint résumé, artifacts |
| Instructions | Créer un dossier + recommandations de l'assistant en dessous |
| Terminal | Sessions tmux brutes — c'est ici que l'utilisateur interagit avec les checkpoints |
| Améliorations | Limites détectées par l'assistant, backlog d'évolutions |

**Checkpoints** : quand Claude écrit un checkpoint.md, l'app web affiche un
résumé court (1-2 lignes tirées du checkpoint) sur la page du dossier et sur
le tableau de bord, avec un bouton "Ouvrir le terminal". Pas de pages checkpoint
dédiées, pas de boutons d'action (Valider/Modifier/Annuler) dans l'UI. L'utilisateur
ouvre le terminal, lit le détail, pose ses questions à Claude si besoin, et
approuve ou refuse directement dans la conversation. Ce pattern est uniforme
pour tous les types de checkpoint (validation, question, MFA, info manquante) —
pas de feature custom par type.

**Pourquoi** : un checkpoint peut être n'importe quoi (facture, email, question
ouverte, MFA). Construire un preview riche par type serait du feature creep
impossible à maintenir. Et souvent la réponse n'est pas un simple "oui/non" —
L'utilisateur veut poser des questions, demander des modifications, faire des recherches
avant de décider. Le terminal est le bon endroit pour ça.

**Mobile** : PWA responsive, pas d'app native. Le terminal tmux est accessible
depuis le téléphone pour répondre aux checkpoints.

**Réutilisation V1** : le dashboard React actuel ne convient pas — l'UI sera
repensée de zéro (maquettes/tests UI à faire avant l'implémentation).

### 5.6 NOTIFICATIONS — Telegram (rôle réduit)

Telegram n'est plus l'interface principale. Il sert uniquement de push notification
vers l'utilisateur avec un lien vers l'app web.

**Types** :
- "Facture avril prête à valider → [Voir dans l'app]"
- "Bloqué sur exali.com (MFA) → [Intervenir]"
- "Relance envoyée à Sopra pour timesheet mai"
- "Email urgent des impôts chypriotes → [Voir]"

**Pourquoi garder Telegram** : les push notifications sont essentielles — l'utilisateur ne
checke pas l'app en permanence. Telegram est déjà configuré et fiable. PAS d'actions
depuis Telegram — juste des notifications. Les actions nécessitent le contexte visuel
de l'app (voir la facture avant de valider, lire le draft).

### 5.7 AMÉLIORATIONS — détection des limites

Quand Claude n'arrive pas à faire quelque chose, il écrit dans
`workspace/_gaps/gaps.md` au lieu de rester silencieux ou d'halluciner.

```markdown
## 2026-03-14 — Connexion exali.com
Problème: Le site demande un MFA par app mobile (authenticator).
Impact: Je ne peux pas remplir le rapport annuel.
Suggestion: Ajouter un skill pour lire les codes TOTP.

## 2026-03-15 — Format de facture Sopra
Problème: Sopra a changé leur template (nouveau champ "numéro de commande" obligatoire).
Impact: Je ne peux pas créer de factures conformes.
Suggestion: Mettre à jour le skill /comptable.
```

C'est le backlog d'améliorations, généré par l'usage réel. Visible dans la page
"Améliorations" de l'app web.

**Logs / Audit trail** : pas de page dédiée dans l'app. L'activité récente est
affichée sur le tableau de bord avec un lien "Voir les logs complets" qui ouvre
le fichier `workspace/_audit/actions.log`. Chaque dossier a aussi son historique
dans sa sidebar. Une page Logs séparée serait du bruit dans la nav pour un usage
rare (debug).

### 5.8 SUGGESTIONS — Claude propose, l'utilisateur décide

Claude ne peut pas créer de dossiers. Quand il détecte quelque chose qui mérite
attention mais qui ne correspond à aucun dossier existant, il crée une suggestion
dans `workspace/_suggestions/`.

**Sources de suggestions** :
- Event entrant sans dossier existant (email des impôts, message d'un fournisseur)
- Observation du sweep (deadline qui approche, relance nécessaire)
- Découverte opportuniste en travaillant sur un autre dossier

**Format d'une suggestion** (`workspace/_suggestions/<slug>.md`) :

```markdown
# Suggestion — Relance impôts chypriotes

URGENCE: urgent
SOURCE: Email reçu de tax@cyprus.gov.cy le 12/03
DATE: 2026-03-14

## Résumé
Email des impôts chypriotes reçu il y a 2 semaines, sans réponse.
Demande de documents pour la déclaration annuelle.

## Pourquoi
Deadline fiscale fin mars. Pas de dossier existant pour le suivi.

## Ce que je ferais
Créer un dossier, analyser l'email, préparer les documents demandés.
```

**Niveaux d'urgence** : `urgent` (deadline proche, conséquence si ignoré),
`normal` (à traiter quand l'utilisateur a le temps), `faible` (opportunité, pas de rush).

**Dans l'app web** : les suggestions apparaissent sur le Home dans une section
dédiée. Chaque suggestion a deux actions : "Créer le dossier" (transforme la
suggestion en dossier workspace/ et lance une session) ou "Ignorer" (supprime
la suggestion). L'urgence est indiquée visuellement par la bordure gauche
(même système que partout).

**Notifications** : les suggestions urgentes déclenchent une notification
Telegram. Les autres sont silencieuses — visibles dans l'app uniquement.

**Principe** : c'est le seul point d'entrée pour du nouveau travail autonome.
L'utilisateur garde le contrôle de ce sur quoi l'assistant passe du temps.

---

## 6. Flux principaux

### Flux 1 : Event externe → action

```
1. Gmail webhook → RECEIVER reçoit "email de comptable@cabinet.com"
2. RECEIVER dédup → pas un doublon → crée un event
3. LAUNCHER lance Claude (tmux) avec l'event
4. Claude :
   a. Lit l'email (Gmail MCP)
   b. Regarde les dossiers workspace/ → matche "demande-comptable"
   c. Lit workspace/demande-comptable/state.md
   d. Prépare la réponse avec les justificatifs
   e. Appelle gmail.reply(...)
      → HOOK PreToolUse se déclenche automatiquement
      → Mini-Claude vérifie : "réponse cohérente, destinataire connu → ALLOW"
      OU → "montant anormal → DENY" OU → "première interaction, demander → ASK"
   f. Si ALLOW → email envoyé, PostToolUse log l'action
   g. Si ASK → l'utilisateur reçoit une notification, doit approuver dans l'app
   h. Met à jour state.md
5. NOTIFICATION → Telegram si pertinent
```

### Flux 2 : Travail de fond (cron)

```
1. Cron périodique → LAUNCHER lance Claude avec :
   "Vérifie les dossiers workspace/. Relances à faire ? Deadlines ? Travail à avancer ?"
2. Claude :
   a. Parcourt les dossiers
   b. Sopra n'a pas répondu depuis 3 jours → envoie une relance
      → hook vérifie → ALLOW (contact connu, relance standard)
   c. Rapport exali dû dans 5 jours → commence à préparer
   d. Met à jour les state.md concernés
3. NOTIFICATION → "Relance envoyée à Sopra"
```

### Flux 3 : Instruction de l'utilisateur

```
1. L'utilisateur ouvre l'app web → "Mets le bureau en vente sur 2ememain, prix 300€"
2. RECEIVER crée un event
3. LAUNCHER lance Claude avec l'instruction
4. Claude :
   a. Crée workspace/2ememain-bureau/ + state.md
   b. Commence sur 2ememain (browser)
   c. A besoin de photos → checkpoint.md : "J'ai besoin de photos du bureau"
5. NOTIFICATION → Telegram → lien app web
6. L'utilisateur envoie les photos via l'app
7. LAUNCHER relance Claude avec les photos
8. Claude crée l'annonce, preview → checkpoint.md
9. L'utilisateur valide → annonce publiée
```

### Flux 4 : Blocage MFA/captcha (intervention manuelle)

```
1. Claude travaille sur le rapport exali (session tmux)
2. Va sur exali.com → login → Bitwarden → OK
3. Le site demande un code MFA
4. Claude écrit checkpoint.md : "Bloqué sur exali.com — MFA requis, intervention manuelle nécessaire"
5. NOTIFICATION → Telegram : "Bloqué sur exali.com (MFA) → [Intervenir]"
6. L'utilisateur fait tmux attach → résout le MFA → se détache
7. Claude continue son travail
8. (Si le MFA revient plus tard, même cycle — le tmux tourne toujours)
```

---

## 7. Ce qu'on réutilise de V1

| Composant V1 | Décision | Détail |
|---|---|---|
| Skills Claude Code | ✅ Intégralement | /comptable, /navigate, /sms, /whatsapp, etc. |
| MCP servers | ✅ Intégralement | Gmail, Calendar, Notion, Coolify, etc. |
| Resource locks (PID) | ✅ Mécanisme | /tmp/opentidy-locks/ |
| Dedup par hash | ✅ Concept | Éviter les doublons webhook |
| Tmux sessions | ✅ Mécanisme | Sessions Claude détachées |
| React dashboard | ❌ Refaire | UI repensée de zéro |
| Telegram bot | 🔄 Simplifier | Notifications uniquement (plus de topics/actions) |
| Event bus | ❌ Remplacer | Receiver simple |
| Queue + priorités | ❌ Supprimer | Plus nécessaire |
| Triage IA custom | ❌ Supprimer | Claude décide lui-même |
| Conversation manager | ❌ Supprimer | Pas un besoin |
| Knowledge base | ❌ Supprimer | Remplacée par workspace/ files |
| Style mimicry | ❌ Supprimer | Pas un besoin |

---

## 8. Approches explorées et écartées

Ce qui suit est un résumé. L'historique complet de la réflexion est dans
`approches-explorees.md` et les fichiers dédiés.

| Approche | Idée | Ce qu'on en garde | Pourquoi le reste a été écarté |
|---|---|---|---|
| A — Workflows codés | Steps prédéfinis avec checkpoints | Concept de checkpoint | Steps codés = rigide. Claude s'adapte dynamiquement. Principe #4 : intelligence dans Claude, pas le code. |
| B — Règles YAML | Routing par pattern matching | — | Casse dès que la réalité est nuancée. Ne gère pas l'inattendu. |
| C — Agent unique | Un Claude, un bureau virtuel | Bureau virtuel en fichiers | Un seul contexte = goulot. Pas de parallélisme. Contexte qui gonfle. |
| D — Multi-agent domaine | Agents compta/admin/social | Parallélisme isolé | Claude est déjà généraliste. La bonne granularité c'est le dossier, pas le domaine. |
| E — Skills only | Tout en skills, backend 50 lignes | Intelligence dans les prompts | On a besoin de plomberie (webhooks, locks, état). "50 lignes" c'est irréaliste. |
| F — Stateless pur | Chaque event = session fraîche | Sessions fraîches = robuste | Overhead cold-start. Perte état browser entre sessions. |
| G — Hybride | Stateless par défaut, stateful si besoin | Compromis pragmatique | Intégré dans l'architecture finale (sessions tmux = stateful le temps de la tâche). |
| H — CLIs custom | Remplacer MCP par des CLIs | — | "Programmer ce que Claude sait déjà faire". Les MCP font déjà ça. |

**Autres décisions écartées** :
- **Claude API / Agent SDK** : trop cher (payant au token), pas d'écosystème existant.
- **Agents spécialisés par domaine** : complexité sans valeur. Un seul type d'agent avec contextes différents.
- **Conversations autonomes temps réel** : pas un besoin réel. Si interactivité nécessaire = outil spécialisé (principe #7).
- **`--allowedTools` pour la sécurité** : Claude contourne via browser/bash. Autant qu'il utilise les bons outils plutôt que de hacker le système.

---

## 9. Questions qui restent ouvertes

Ce qui est listé ici est VRAIMENT ouvert — les questions qui nécessitent des tests
concrets ou des décisions d'implémentation, pas de la réflexion architecturale.

### 9.1 Intervention humaine et lifecycle des sessions (VALIDÉ)

**Un seul comportement.** Quand Claude est bloqué (info, validation, MFA, captcha) :

1. Il écrit checkpoint.md avec ce qu'il attend
2. Il demande dans le terminal (conversation interactive normale)
3. Le hook `Notification` / `idle_prompt` se déclenche → notifie Telegram
4. Un script côté backend démarre un timer (configurable, 1h par défaut)

**Si l'utilisateur est là** (tmux attaché ou attache après la notif) : il répond directement
dans le terminal. Claude continue. Pas de coupure, pas de cold start. Pour un MFA,
L'utilisateur peut même interagir directement avec le browser.

**Si l'utilisateur ne répond pas** (timeout expiré) : le script envoie un message à Claude
via `tmux send-keys` ("Timeout, sauvegarde ton état et termine"). Claude met à jour
state.md avec où il en était précisément, et quitte proprement.

**Pour reprendre** : le backend relance avec `claude --resume <session-id>` (stocké
dans `workspace/<dossier>/.session-id`). Claude reprend avec son historique compacté
+ state.md structuré. Meilleur des deux mondes : mémoire conversationnelle (resume)
+ état structuré du dossier (state.md).

**Mécanismes natifs utilisés** :
- Hook `Notification` matcher `idle_prompt` → détecte que Claude attend un input
- Hook `Stop` → détecte que Claude a fini de répondre
- `claude --resume` → reprise avec historique compacté
- `tmux send-keys` → communication backend → Claude pour le timeout

### 9.2 Cron de fond — approche validée

**Décision validée.** Un `setInterval` dans le backend (toutes les heures par défaut,
calibrable via env var) qui lance un `claude -p` "sweep" léger.

C'est le **seul usage de `claude -p`** dans tout le système. Justifié parce que le
sweep est read-only : pas d'interaction, pas de browser, juste lire des fichiers et
réfléchir. Tout le reste utilise tmux.

Le sweep Claude :
1. Lit tous les `workspace/*/state.md`
2. Identifie les dossiers qui ont besoin d'action (deadline, relance, travail à avancer)
3. Crée des suggestions dans `_suggestions/` si des events/emails non traités le méritent
4. Retourne la liste des dossiers à lancer

Le backend parse la réponse et lance des sessions tmux focalisées pour chaque dossier.
Le sweep ne fait pas le travail — il scanne et dispatche. Le vrai travail respecte
le principe sessions-par-dossier. Les deadlines et relances sont dans les state.md.
Claude les lit et décide quoi prioriser (principe #4).

### 9.2 Events multi-dossiers — résolu

**Pas un problème d'architecture.** Quand un event concerne plusieurs dossiers, Claude
le voit et agit en conséquence — il met à jour les state.md concernés, traite ce qu'il
peut, note le reste. C'est exactement ce qu'un humain ferait. Pas besoin de mécanisme
de routing ou de duplication (principe #4).

---

## 10. Recherche externe — concepts clés retenus

| Concept | Source | Ce qu'on en retient |
|---|---|---|
| Constitution en langage naturel | IronCurtain | Règles simples → comportements émergents. Nos 4 règles ADN suivent ce pattern. |
| Reversible Autonomy | Rubrik, IBM STRATUS | Accepter l'erreur + la rendre réparable. Audit trail = filet de sécurité ultime. |
| Zero-Trust Agent | Microsoft | Chaque action checked, limited, logged. Aligné avec nos 4 règles ADN. |
| Excessive Agency | OWASP LLM06:2025 | 3 causes racines : trop de fonctionnalité, permissions, autonomie. Les hooks limitent l'autonomie sur les actions critiques. |
| Confident but wrong | CMU 2025 | RLHF rend les LLMs confiants même quand ils se trompent → vérification EXTERNE obligatoire, pas interne. |
| Mémoire à deux niveaux | Letta/MemGPT | Core (en contexte, comme RAM) + Archival (hors contexte, searchable). Pour nous : state.md = core, historique archivé = archival. |
| Contexte qui se dégrade | Google ADK, van Deth | Dégradation pas linéaire, accélère après 75%. Justifie les sessions courtes et focalisées. |
| Scaffolding > Raw intelligence | PAI (Miessler) | "Haiku can outperform Opus when the scaffolding is good." Notre boulot c'est le scaffolding. |

---

## 11. Référence technique — hooks

Voir `hooks-techniques.md` pour les détails complets. Résumé :

**Ce que le hook reçoit (stdin JSON)** : `session_id`, `transcript_path`,
`tool_name`, `tool_input` (paramètres complets), `cwd`, `permission_mode`.
Pour les outils Playwright, `tool_input` contient un champ `element` (description
textuelle de l'élément cliqué).

**Ce que le hook peut répondre** :
- `exit 0` → ALLOW
- `exit 2` → DENY (stderr envoyé à Claude)
- JSON avec `permissionDecision: "allow" | "deny" | "ask"`
- `updatedInput` → peut MODIFIER les paramètres avant exécution (correction, pas
  juste blocage)

**Ordre d'exécution** : PreToolUse Hook → Deny Rules → Allow Rules → Ask Rules →
Permission Mode → canUseTool → PostToolUse Hook

**Contraintes** : timeout max 600s, hooks chargés au démarrage (restart pour
changements), hooks parallèles si multiple sur même matcher, pas de récursion
(`type: "prompt"` est natif, immunisé contre la récursion contrairement à
`type: "command"` qui lancerait `claude -p`).

---

## 12. Capabilities futures (hors scope V2)

Tout futur capability = un skill que Claude appelle. L'architecture V2 ne doit PAS
être conçue spécifiquement pour ces features — elle doit juste être assez flexible
pour les brancher.

- Appels téléphoniques
- Réservations (restaurant, RDV)
- Shopping / achats en ligne
- Gestion de voyage
- Veille informationnelle
- Conversations autonomes avancées (si le besoin émerge)
- **OMI** (device open source d'enregistrement continu) — à explorer
  ce qu'on peut en tirer (transcription, contexte, instructions vocales, etc.)
- **iPhone 11** (écran cassé) — dédié à l'assistant pour interactions téléphone
- **Mac Mini dédié** — machine isolée pour l'assistant (24/7, pas de conflit avec l'utilisateur)
