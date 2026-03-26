# Tests End-to-End : Assistant V2

Document exhaustif des tests E2E couvrant toute la spec `v2-final.md`.
Chaque test valide un flux complet à travers plusieurs composants.

---

## 0. STRATÉGIE TECHNIQUE

### 3 niveaux de tests

| Niveau | Outil | Quand lancer | Couvre |
|---|---|---|---|
| **Vitest** | `pnpm test` | CI, chaque push | Backend: receiver, launcher, state manager, infra, locks, dedup |
| **Playwright** | `pnpm test:e2e` | CI, chaque push | App web: UI, navigation, affichage, interactions |
| **Smoke `/test`** | `/test <scénario>` | Fin d'implémentation, validation majeure | Flux complets cross-composants avec backend réel |

### Setup Vitest (unit + integration)

```bash
# Lancer tous les tests backend
pnpm test

# Lancer un fichier spécifique
pnpm test tests/receiver/webhook.test.ts

# Lancer par ID E2E
pnpm test -t "E2E-RCV-01"
```

**Principes** :
- Chaque test crée un workspace temporaire (`tmp/test-workspace-<random>/`)
- Claude est **mocké** : le launcher appelle une fonction mock au lieu du vrai `claude` CLI
- Telegram est **mocké** : les notifications sont capturées dans un tableau
- Les locks utilisent un dossier temporaire (pas `/tmp/opentidy-locks/`)
- Cleanup automatique après chaque test

**Structure des fichiers de test** :
```
apps/backend/tests/
├── receiver/
│   ├── webhook.test.ts         # E2E-RCV-01, -02, -03, -08
│   ├── watchers.test.ts        # E2E-RCV-04, -05
│   ├── triage.test.ts          # E2E-RCV-06, -07
│   └── fixtures/
│       ├── gmail-webhook.json
│       ├── whatsapp-message.json
│       └── workspace/          # workspace pré-rempli pour les tests
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
│   ├── pretooluse.test.ts      # E2E-GF-01 à -14, -15 à -18
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
# Lancer tous les tests UI
pnpm test:e2e

# Lancer un fichier spécifique
pnpm test:e2e tests/e2e/home.spec.ts

# Avec UI mode (debug)
pnpm test:e2e --ui
```

**Principes** :
- Un `globalSetup` qui lance le backend en mode test + le frontend Vite
- Le backend sert un workspace de fixtures (dossiers, suggestions, gaps pré-remplis)
- Pas de Claude réel: l'API renvoie des données fixtures
- Tests sur 2 viewports : desktop (1280px) et mobile (375px)

**Structure des fichiers de test** :
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
    └── test-workspace/         # workspace pré-rempli pour les tests UI
```

### Setup Smoke `/test` (flux complets)

Ces tests sont lancés **manuellement** à la fin de l'implémentation, ou lors de validations
majeures. Ils utilisent le vrai backend, le vrai frontend, et un workspace de test.

```bash
# Préparer l'environnement de smoke test
pnpm smoke:setup    # crée workspace/smoke-test/ avec les fixtures
pnpm smoke:start    # lance backend + frontend en mode smoke

# Puis dans Claude Code, lancer chaque scénario :
/test <scénario>

# Nettoyer après
pnpm smoke:cleanup
```

**Les commandes `/test` exactes sont dans la section 12 (FLUX COMPLETS).**

### Matrice de couverture

Chaque test porte un tag de niveau :
- 🧪 = Vitest
- 🎭 = Playwright
- 🔥 = Smoke `/test`

---

## 1. RECEIVER : Réception et triage des events 🧪

**Fichier** : `apps/backend/tests/receiver/*.test.ts`
**Mock** : Claude (triage simulé), Telegram (notifications capturées)
**Setup** : workspace temporaire avec dossiers fixtures

```bash
pnpm test tests/receiver/
```

### E2E-RCV-01 : Event Gmail → routing vers dossier existant
**Préconditions** : dossier `workspace/factures-sopra/` existe avec un state.md actif
**Steps** :
1. Webhook Gmail reçoit un email de `billing@soprasteria.com`
2. Receiver crée un event au format uniforme (source, contenu, timestamp, métadonnées)
3. Launcher lance une session Claude triage avec l'event
4. Claude lit les dossiers workspace/, identifie `factures-sopra` comme match
5. Claude route l'event vers le dossier, lance/reprend une session focalisée
**Attendu** : l'event est traité dans le contexte de `factures-sopra`, state.md mis à jour

### E2E-RCV-02 : Event Gmail → pas de dossier existant → suggestion
**Préconditions** : aucun dossier lié aux impôts chypriotes
**Steps** :
1. Webhook Gmail reçoit un email de `tax@cyprus.gov.cy`
2. Receiver crée un event
3. Claude triage : aucun dossier existant ne matche
4. Claude crée `workspace/_suggestions/impots-chypre.md` avec urgence, source, résumé
**Attendu** : suggestion créée, PAS de dossier créé. Notification Telegram si urgent.

### E2E-RCV-03 : Event Gmail → déduplication
**Préconditions** : un webhook Gmail a déjà été reçu pour le même email (même content hash)
**Steps** :
1. Webhook Gmail reçoit le même email une 2e fois (retry Gmail)
2. Receiver calcule le hash du contenu
3. Hash déjà vu → event ignoré
**Attendu** : pas de session lancée, pas de doublon

### E2E-RCV-04 : Event WhatsApp watcher → routing
**Préconditions** : watcher WhatsApp actif, dossier `workspace/2ememain-bureau/` existe
**Steps** :
1. Watcher détecte un nouveau message WhatsApp d'un acheteur potentiel
2. Receiver crée un event
3. Claude triage → match `2ememain-bureau`
4. Session lancée avec le contexte du dossier + le message
**Attendu** : message traité, state.md mis à jour avec l'info de l'acheteur

### E2E-RCV-05 : Event SMS watcher → nouveau contact → suggestion
**Préconditions** : watcher SMS actif, message d'un numéro inconnu
**Steps** :
1. Watcher détecte un SMS d'un numéro non lié à un dossier
2. Claude triage → aucun dossier ne matche
3. Suggestion créée avec le contenu du SMS
**Attendu** : suggestion dans `_suggestions/`, pas de dossier

### E2E-RCV-06 : Event multi-dossiers
**Préconditions** : email de la comptable qui concerne 2 dossiers (factures Sopra + TVA)
**Steps** :
1. Webhook Gmail reçoit l'email
2. Claude triage → identifie que l'email concerne 2 dossiers
3. Claude met à jour les state.md des 2 dossiers concernés
**Attendu** : les 2 dossiers sont mis à jour, pas de duplication d'event

### E2E-RCV-08 : Event pour un dossier COMPLETED
**Préconditions** : dossier `factures-sopra` au statut COMPLETED
**Steps** :
1. Webhook Gmail reçoit un email de `billing@soprasteria.com`
2. Claude triage → matche `factures-sopra` mais voit qu'il est COMPLETED
**Attendu** : Claude crée une suggestion (pas de réouverture automatique) OU relance le dossier si pertinent, selon le contenu de l'email. Le dossier COMPLETED n'est jamais modifié silencieusement.

### E2E-RCV-07 : Event spam / non pertinent
**Steps** :
1. Webhook Gmail reçoit un email marketing
2. Claude triage → pas pertinent, aucun dossier concerné, pas matière à suggestion
**Attendu** : event classé et ignoré, pas de suggestion, pas de dossier

---

## 2. WORKSPACE : État des dossiers 🧪

**Fichier** : `apps/backend/tests/workspace/*.test.ts`
**Mock** : Claude (sessions simulées), filesystem temporaire
**Setup** : workspace temporaire avec state.md, checkpoint.md, artifacts fixtures

```bash
pnpm test tests/workspace/
```

### E2E-WS-01 : Création de dossier via app web
**Steps** :
1. L'utilisateur ouvre l'app web → page "Nouveau"
2. Tape "Mets le bureau en vente sur 2ememain, prix 300€"
3. Clique "Lancer"
4. Backend crée `workspace/2ememain-bureau/` + state.md initial
5. Launcher lance une session Claude avec l'instruction
**Attendu** : dossier créé, session active, state.md contient l'objectif et l'instruction

### E2E-WS-02 : Création de dossier via approbation de suggestion
**Préconditions** : `workspace/_suggestions/impots-chypre.md` existe
**Steps** :
1. L'utilisateur ouvre l'app web → Home → section Suggestions
2. Clique "Créer le dossier" sur la suggestion impôts chypriotes
3. Backend crée `workspace/impots-chypre/` + state.md basé sur la suggestion
4. Supprime `_suggestions/impots-chypre.md`
5. Lance une session Claude
**Attendu** : dossier créé avec le contexte de la suggestion, suggestion supprimée

### E2E-WS-03 : Ignorer une suggestion
**Préconditions** : `workspace/_suggestions/timesheet-juin.md` existe
**Steps** :
1. L'utilisateur clique "Ignorer" sur la suggestion
2. Backend supprime `_suggestions/timesheet-juin.md`
**Attendu** : suggestion supprimée, aucun dossier créé

### E2E-WS-04 : State.md mis à jour après session
**Préconditions** : session Claude active sur `factures-sopra`
**Steps** :
1. Claude travaille (envoie une relance email)
2. Claude met à jour state.md (ajoute "relance envoyée le 14/03")
3. Session se termine
**Attendu** : state.md reflète le travail fait, timestamp mis à jour

### E2E-WS-05 : State.md condensation
**Préconditions** : state.md de `factures-sopra` a un historique très long (>50 entrées)
**Steps** :
1. Claude ouvre le state.md
2. L'instruction prompt lui dit de garder state.md concis
3. Claude condense les anciennes entrées ("Jan-Mar 2025: toutes envoyées ✓")
**Attendu** : state.md plus court, info essentielle préservée, détails anciens condensés

### E2E-WS-06 : Checkpoint.md création et détection
**Steps** :
1. Claude travaille sur un dossier et a besoin de l'utilisateur
2. Claude écrit `checkpoint.md` dans le dossier
3. Hook SessionEnd ou idle_prompt détecte le checkpoint
4. Backend envoie une notification Telegram
5. App web affiche le résumé du checkpoint sur la Home et la page du dossier
**Attendu** : checkpoint visible dans l'UI avec résumé + bouton "Ouvrir le terminal"

### E2E-WS-07 : Checkpoint.md supprimé après réponse
**Préconditions** : checkpoint.md existe dans un dossier
**Steps** :
1. L'utilisateur ouvre le terminal, répond au checkpoint
2. Claude continue le travail
3. Claude supprime checkpoint.md (ou le remplace par le prochain)
4. App web ne montre plus le checkpoint
**Attendu** : checkpoint disparaît de l'UI une fois traité

### E2E-WS-08 : Artifacts stockés dans le bon dossier
**Steps** :
1. Claude crée une facture PDF pour le dossier `factures-sopra`
2. Le fichier est sauvé dans `workspace/factures-sopra/artifacts/facture-2025-04.pdf`
**Attendu** : fichier accessible via la page dossier dans l'app web

### E2E-WS-10 : _inbox/events.md, events non rattachés
**Steps** :
1. Un event arrive mais Claude ne le rattache à aucun dossier et ne crée pas de suggestion
2. L'event est écrit dans `workspace/_inbox/events.md`
**Attendu** : event loggé dans l'inbox, format lisible, timestamp, source, contenu

### E2E-WS-11 : Validation du format state.md
**Préconditions** : dossier avec un state.md bien structuré
**Steps** :
1. App web ouvre la page dossier
2. Parse le champ `STATUS:` (IN_PROGRESS, COMPLETED, BLOCKED)
**Attendu** : le statut est correctement parsé et affiché (badge couleur, icône)

### E2E-WS-12 : Création de dossier avec fichier joint
**Steps** :
1. L'utilisateur ouvre la page Nouveau
2. Écrit une instruction + joint 2 photos
3. Clique "Lancer"
4. Backend crée le dossier + copie les fichiers dans `artifacts/`
5. Session lancée avec les fichiers dans le contexte
**Attendu** : dossier créé, fichiers accessibles dans `workspace/<dossier>/artifacts/`, Claude les voit

### E2E-WS-13 : Upload de fichier vers un dossier existant
**Préconditions** : dossier `2ememain-bureau` existe, checkpoint demande des photos
**Steps** :
1. L'utilisateur ouvre la page du dossier
2. Upload 3 photos via l'interface
3. Fichiers sauvés dans `artifacts/`
4. Session relancée ou notifiée avec les nouveaux fichiers
**Attendu** : Claude reçoit les fichiers et continue le travail

### E2E-WS-09 : Dossier terminé
**Steps** :
1. Claude finit tout le travail sur un dossier
2. Claude met state.md à `STATUS: COMPLETED`
3. Hook SessionEnd détecte le statut terminé
4. Notification Telegram envoyée
**Attendu** : dossier visible comme "terminé" dans l'app (opacité réduite), pas de session active

---

## 3. LAUNCHER : Sessions Claude tmux 🧪

**Fichier** : `apps/backend/tests/launcher/*.test.ts`
**Mock** : `claude` CLI (remplacé par un script qui écrit dans state.md), tmux (commandes vérifiées mais pas exécutées en CI)
**Setup** : workspace temporaire, locks temporaires

```bash
pnpm test tests/launcher/
```

### E2E-LCH-01 : Lancement d'une session focalisée
**Steps** :
1. Un event déclenche le travail sur `factures-sopra`
2. Launcher vérifie qu'aucun lock n'existe pour ce dossier
3. Crée un lock PID dans `/tmp/opentidy-locks/factures-sopra.lock`
4. Lance `claude` dans une session tmux nommée
5. Injecte le contexte : state.md + event + prompt système
**Attendu** : session tmux active, lock créé, contexte chargé

### E2E-LCH-02 : Lock de dossier empêche session parallèle
**Préconditions** : session active sur `factures-sopra`, lock existe
**Steps** :
1. Un nouvel event arrive pour `factures-sopra`
2. Launcher vérifie le lock → dossier déjà locké
**Attendu** : pas de 2e session lancée. Event mis en attente ou traité après.

### E2E-LCH-03 : Sessions parallèles sur dossiers différents
**Steps** :
1. Event pour `factures-sopra` → session 1 lancée
2. Event pour `exali-rapport` → session 2 lancée
3. Les deux tournent en parallèle dans des tmux séparés
**Attendu** : 2 sessions indépendantes, chacune avec son lock, pas d'interférence

### E2E-LCH-04 : Contexte minimal chargé
**Steps** :
1. Launcher prépare le contexte pour une session `expat-chypre`
2. Contexte = state.md + event déclencheur + prompt système
**Attendu** : pas de state.md d'autres dossiers chargé, pas de contexte global

### E2E-LCH-05 : Détection fin de session (hook SessionEnd)
**Steps** :
1. Claude termine sa session (travail fini ou checkpoint écrit)
2. Hook SessionEnd se déclenche
3. Backend : supprime le lock, vérifie checkpoint.md, vérifie state.md, log audit trail
**Attendu** : lock libéré, notification si checkpoint/terminé, log écrit

### E2E-LCH-06 : Crash recovery, session crash mid-work
**Steps** :
1. Session Claude plante (OOM, kill, etc.)
2. Lock PID encore présent mais le process n'existe plus
3. Au prochain sweep ou event, le launcher détecte le PID mort
4. Lock nettoyé, session relançable
**Attendu** : le système ne reste pas bloqué, state.md a le dernier état connu

### E2E-LCH-07 : Resume de session après timeout
**Préconditions** : session précédente terminée proprement avec `.session-id` sauvegardé
**Steps** :
1. Nouveau stimulus pour le même dossier
2. Launcher lance `claude --resume <session-id>`
3. Claude reprend avec historique compacté + state.md à jour
**Attendu** : continuité conversationnelle, pas de perte de contexte

### E2E-LCH-09 : Confirm mode: dossier avec validation
**Préconditions** : dossier créé avec l'option "Valider avant actions externes"
**Steps** :
1. Claude travaille sur le dossier
2. Claude veut envoyer un email
3. Le mode confirm transforme l'action en checkpoint au lieu de l'exécuter
**Attendu** : l'email n'est pas envoyé, checkpoint.md créé demandant validation, notification Telegram

### E2E-LCH-10 : Réutilisation profil Camoufox entre sessions
**Préconditions** : session précédente sur `exali-rapport` a login exali.com via Camoufox profil "exali"
**Steps** :
1. Nouvelle session sur `exali-rapport`
2. Camoufox relance avec le profil "exali"
3. Cookies de session toujours valides
**Attendu** : pas besoin de re-login, la page exali.com est déjà authentifiée

### E2E-LCH-11 : Event arrive pour un dossier avec checkpoint en cours
**Préconditions** : `factures-sopra` a un checkpoint en attente, lock actif
**Steps** :
1. Nouvel email arrive pour `factures-sopra`
2. Launcher vérifie le lock → dossier locké
**Attendu** : l'event est noté/stocké pour être traité après que le checkpoint soit résolu. Pas de perte d'event.

### E2E-LCH-08 : Sweep ignore les dossiers lockés
**Préconditions** : `factures-sopra` a un lock actif, `exali-rapport` n'en a pas
**Steps** :
1. Cron sweep lance Claude
2. Claude parcourt les dossiers
3. `factures-sopra` → lockée, skip
4. `exali-rapport` → besoin d'action, session focalisée lancée
**Attendu** : seul exali-rapport est traité

---

## 4. GARDE-FOUS : Hooks PreToolUse 🧪

**Fichier** : `apps/backend/tests/hooks/*.test.ts`
**Mock** : mini-Claude (réponses fixtures ALLOW/DENY/ASK), outils (gmail.send simulé)
**Setup** : hook config fixtures, audit log temporaire

```bash
pnpm test tests/hooks/
```

### E2E-GF-01 : Email safe → ALLOW
**Steps** :
1. Claude appelle `gmail.reply()` pour répondre à billing@soprasteria.com (contact connu, contenu standard)
2. Hook PreToolUse prompt se déclenche
3. Mini-Claude évalue : destinataire connu, contenu cohérent, pas de paiement
**Attendu** : ALLOW, email envoyé, log audit trail (PostToolUse)

### E2E-GF-02 : Email avec montant anormal → DENY
**Steps** :
1. Claude appelle `gmail.send()` avec un montant incohérent (facture 120 000€ au lieu de 12 000€)
2. Hook PreToolUse se déclenche
3. Mini-Claude détecte l'anomalie
**Attendu** : DENY avec raison, Claude reçoit "action refusée : montant anormal", email non envoyé

### E2E-GF-03 : Email première interaction → ASK
**Steps** :
1. Claude appelle `gmail.send()` vers un nouveau destinataire jamais contacté
2. Hook évalue : première interaction, demander à l'utilisateur
**Attendu** : ASK, notification Telegram à l'utilisateur, email en attente d'approbation

### E2E-GF-04 : Browser click safe → ALLOW
**Steps** :
1. Claude appelle `browser_click` sur un bouton "Search" (élément: "Search button")
2. Hook évalue : bouton de recherche, pas de risque
**Attendu** : ALLOW, clic exécuté

### E2E-GF-05 : Browser click paiement → DENY
**Steps** :
1. Claude appelle `browser_click` sur "Confirm Payment" (élément: "Confirm Payment button")
2. Hook évalue : bouton de paiement, irréversible
**Attendu** : DENY, clic bloqué, Claude informé

### E2E-GF-06 : Browser fill_form financier → DENY
**Steps** :
1. Claude appelle `browser_fill_form` sur un formulaire de virement bancaire
2. Hook évalue : formulaire financier
**Attendu** : DENY

### E2E-GF-07 : Browser evaluate JS arbitraire
**Steps** :
1. Claude appelle `browser_evaluate` avec du JS qui modifie le DOM
2. Hook évalue le code JS
**Attendu** : ALLOW si lecture seule, DENY si modification de données financières

### E2E-GF-08 : Bash avec curl POST → vérification
**Steps** :
1. Claude appelle Bash avec `curl -X POST https://api.external.com/...`
2. Hook command détecte le pattern réseau (POST, ssh, scp)
**Attendu** : hook vérifie, ALLOW ou DENY selon la cible

### E2E-GF-09 : Lecture seule Gmail → pas de hook
**Steps** :
1. Claude appelle `gmail.search()` ou `gmail.read()`
**Attendu** : pas de hook déclenché, exécution directe

### E2E-GF-10 : Lecture seule browser → pas de hook
**Steps** :
1. Claude appelle `browser_navigate` ou `browser_snapshot`
**Attendu** : pas de hook déclenché, exécution directe

### E2E-GF-11 : Opérations locales → pas de hook
**Steps** :
1. Claude appelle Read, Write, Grep, Glob sur des fichiers workspace/
**Attendu** : pas de hook, exécution directe

### E2E-GF-12 : PostToolUse audit trail
**Steps** :
1. Claude exécute gmail.send() (ALLOW)
2. PostToolUse hook se déclenche
3. `audit-logger.js` écrit dans `workspace/_audit/actions.log`
**Attendu** : log contient timestamp, tool_name, paramètres, session_id, résultat

### E2E-GF-13 : Hook timeout (30s email)
**Steps** :
1. Claude appelle gmail.send()
2. Le mini-Claude du hook met plus de 30s à répondre
**Attendu** : timeout → comportement par défaut (DENY par sécurité ou ASK)

### E2E-GF-15 : Hook ASK → l'utilisateur approuve → action exécutée
**Préconditions** : Claude a appelé gmail.send() vers un nouveau destinataire, hook a retourné ASK
**Steps** :
1. Notification Telegram envoyée à l'utilisateur
2. L'utilisateur ouvre l'app, voit l'action en attente
3. L'utilisateur approuve
**Attendu** : l'email est envoyé, PostToolUse audit log, Claude continue son travail

### E2E-GF-16 : Hook ASK → l'utilisateur refuse → action annulée
**Préconditions** : même que GF-15, hook ASK
**Steps** :
1. Notification Telegram envoyée
2. L'utilisateur ouvre l'app, refuse l'action
**Attendu** : email NON envoyé, Claude reçoit "action refusée par l'utilisateur", Claude s'adapte (checkpoint ou alternative)

### E2E-GF-17 : Hook ASK → timeout sans réponse de l'utilisateur
**Préconditions** : même que GF-15, hook ASK
**Steps** :
1. Notification Telegram envoyée
2. L'utilisateur ne répond pas pendant le timeout
**Attendu** : action refusée par défaut (DENY), Claude informé, peut écrire un checkpoint

### E2E-GF-18 : Plusieurs hooks sur le même appel d'outil
**Steps** :
1. Claude appelle gmail.send() qui matche 2 hooks PreToolUse (hook email + hook générique réseau)
2. Les 2 hooks s'exécutent en parallèle
**Attendu** : les 2 doivent retourner ALLOW pour que l'action s'exécute. Si l'un DENY, action bloquée.

### E2E-GF-14 : Hook updatedInput, correction des paramètres
**Steps** :
1. Claude appelle gmail.send() avec un destinataire avec une typo
2. Hook détecte et retourne `updatedInput` avec le destinataire corrigé
**Attendu** : email envoyé avec les paramètres corrigés

---

## 5. APP WEB : Interface 🎭

**Fichier** : `apps/web/tests/e2e/*.spec.ts`
**Setup** : backend lancé en mode test (`pnpm test:e2e:setup`), workspace fixtures pré-rempli
**Viewports** : desktop (1280×800) + mobile (375×667)

```bash
pnpm test:e2e
pnpm test:e2e --ui  # mode debug avec inspecteur
```

### E2E-APP-01 : Home affiche les checkpoints en attente
**Préconditions** : 1 dossier avec checkpoint.md, 1 dossier avec MFA bloquant
**Steps** :
1. Ouvrir la Home
**Attendu** : section "Pour toi" avec 2 cartes (checkpoint + MFA), chacune avec "Ouvrir le terminal"

### E2E-APP-02 : Home affiche les suggestions
**Préconditions** : 2 suggestions dans `_suggestions/`
**Steps** :
1. Ouvrir la Home
**Attendu** : section "Suggestions" avec 2 cartes, boutons "Créer le dossier" / "Ignorer", badge urgence

### E2E-APP-03 : Home affiche les sessions actives
**Préconditions** : 2 sessions tmux en cours
**Steps** :
1. Ouvrir la Home
**Attendu** : section "En fond" avec les 2 dossiers actifs, dot vert, durée

### E2E-APP-04 : Home affiche l'activité récente + lien logs
**Steps** :
1. Ouvrir la Home
**Attendu** : section "Activité récente" avec les derniers events, lien "Voir les logs complets" qui ouvre le fichier audit

### E2E-APP-05 : Home zen quand rien à faire
**Préconditions** : aucun checkpoint, aucune suggestion, 0-2 sessions actives
**Steps** :
1. Ouvrir la Home
**Attendu** : affichage zen (orbe, "Tout roule", sessions actives listées)

### E2E-APP-06 : Page Dossiers, liste avec filtres
**Steps** :
1. Ouvrir la page Dossiers
**Attendu** : tous les dossiers listés, filtres Actifs/Terminés/Bloqués, recherche, bouton "+ Nouveau"

### E2E-APP-07 : Page Dossiers, badge checkpoint sur dossier
**Préconditions** : dossier `factures-sopra` a un checkpoint.md
**Steps** :
1. Ouvrir la page Dossiers
**Attendu** : badge "1 checkpoint" sur la carte du dossier

### E2E-APP-08 : Page Dossier detail, state.md rendu
**Steps** :
1. Ouvrir un dossier
**Attendu** : state.md rendu en HTML lisible (objectif, fait, reste à faire), pas le markdown brut

### E2E-APP-09 : Page Dossier detail, checkpoint résumé
**Préconditions** : checkpoint.md existe
**Steps** :
1. Ouvrir le dossier
**Attendu** : bannière checkpoint en haut avec résumé 1-2 lignes + "Ouvrir le terminal"

### E2E-APP-10 : Page Dossier detail, sidebar (session, fichiers, historique)
**Steps** :
1. Ouvrir un dossier avec session active
**Attendu** : sidebar droite avec statut session, liste fichiers (state.md, artifacts), historique récent

### E2E-APP-11 : Page Dossier detail, barre d'instruction
**Steps** :
1. Ouvrir un dossier
2. Taper une instruction dans la barre en bas
3. Cliquer "Envoyer"
**Attendu** : instruction envoyée au backend, nouvelle session lancée ou existante notifiée

### E2E-APP-12 : Page Terminal, onglets de sessions
**Préconditions** : 3 sessions tmux actives
**Steps** :
1. Ouvrir la page Terminal
**Attendu** : 3 onglets, chacun nommé par le dossier, indicateur de statut (actif, MFA, idle)

### E2E-APP-13 : Page Terminal, interaction avec session tmux
**Steps** :
1. Ouvrir un onglet terminal
2. Taper une réponse au checkpoint
**Attendu** : input envoyé à la session tmux, Claude répond, terminal se met à jour en temps réel

### E2E-APP-14 : Page Terminal, barre de statut
**Steps** :
1. Ouvrir un onglet terminal
**Attendu** : barre en bas avec nom dossier, numéro tmux, durée idle, statut

### E2E-APP-15 : Page Nouveau, créer un dossier
**Steps** :
1. Ouvrir la page Nouveau
2. Écrire une instruction
3. Cocher "Valider avant actions externes" (optionnel)
4. Joindre un fichier (optionnel)
5. Cliquer "Lancer"
**Attendu** : dossier créé, session lancée, redirection vers la page du dossier

### E2E-APP-16 : Page Nouveau, recommandations en dessous
**Préconditions** : 2 suggestions dans `_suggestions/`
**Steps** :
1. Ouvrir la page Nouveau
**Attendu** : les suggestions sont affichées sous le formulaire, avec les mêmes boutons que sur la Home

### E2E-APP-17 : Page Améliorations, liste des limites
**Préconditions** : 3 entrées dans `workspace/_gaps/gaps.md`
**Steps** :
1. Ouvrir la page Améliorations
**Attendu** : 3 cartes avec titre, description, impact, suggestion, lien vers dossier concerné, bouton "Marquer résolu"

### E2E-APP-18 : Page Améliorations, filtrer ouvertes/résolues
**Steps** :
1. Cliquer "Ouvertes" → seules les ouvertes
2. Cliquer "Résolues" → seules les résolues
**Attendu** : filtre fonctionne

### E2E-APP-19 : PWA responsive, mobile
**Steps** :
1. Ouvrir l'app sur mobile (ou viewport 320px)
**Attendu** : tab bar en bas (Home, Dossiers, Nouveau, Terminal, Plus), contenu adapté

### E2E-APP-20 : PWA responsive, desktop
**Steps** :
1. Ouvrir l'app sur desktop
**Attendu** : icon rail à gauche (Home, Dossiers, Terminal, Améliorations), avatar en bas

### E2E-APP-22 : Mises à jour temps réel (SSE/WebSocket)
**Préconditions** : app web ouverte sur la Home, 1 session active
**Steps** :
1. Claude écrit un checkpoint.md (événement côté backend)
2. Vérifier la Home sans refresh
**Attendu** : la section "Pour toi" se met à jour en temps réel avec le nouveau checkpoint

### E2E-APP-23 : Recherche de dossier
**Préconditions** : 10 dossiers dans workspace/
**Steps** :
1. Ouvrir la page Dossiers
2. Taper "sopra" dans la barre de recherche
**Attendu** : seuls les dossiers contenant "sopra" sont affichés, les autres masqués

### E2E-APP-24 : Terminal sur mobile
**Steps** :
1. Ouvrir la page Terminal sur un viewport 320px
2. Sélectionner un onglet de session
**Attendu** : le terminal est fonctionnel (scrollable, input possible), pas juste un placeholder

### E2E-APP-25 : Urgence visuelle des suggestions
**Préconditions** : 3 suggestions : 1 urgente, 1 normale, 1 low
**Steps** :
1. Ouvrir la Home
**Attendu** : bordure rouge/gauche pour urgent, jaune pour normal, grise pour low. Les urgentes en premier.

### E2E-APP-26 : État vide / premier lancement
**Préconditions** : workspace/ vide (ou n'existe pas encore)
**Steps** :
1. Ouvrir l'app web
**Attendu** : Home zen (pas d'erreur), page Dossiers vide avec message d'accueil + bouton "Créer un dossier", pas de crash

### E2E-APP-27 : Navigation Telegram → app web
**Steps** :
1. Recevoir une notification Telegram avec lien "[Voir dans l'app]"
2. Cliquer le lien
**Attendu** : ouverture de l'app web sur la bonne page (dossier concerné, pas la Home générique)

### E2E-APP-28 : Instruction bar + mode confirm
**Steps** :
1. Ouvrir un dossier
2. Taper une instruction + cocher "Valider avant actions externes"
3. Envoyer
**Attendu** : instruction envoyée avec le flag confirm, session lancée en mode confirm

### E2E-APP-21 : Navigation Home → Dossier → Terminal
**Steps** :
1. Sur la Home, cliquer sur une carte checkpoint
2. Arrive sur la page dossier avec le résumé
3. Cliquer "Ouvrir le terminal"
4. Arrive sur le terminal avec le bon onglet sélectionné
**Attendu** : navigation fluide, bon dossier/session ciblé à chaque étape

---

## 6. NOTIFICATIONS : Telegram 🧪

**Fichier** : `apps/backend/tests/notifications/*.test.ts`
**Mock** : API Telegram (appels capturés, pas envoyés)
**Setup** : mock Telegram qui enregistre les messages envoyés dans un tableau

```bash
pnpm test tests/notifications/
```

### E2E-NTF-01 : Checkpoint → notification Telegram
**Steps** :
1. Claude écrit checkpoint.md
2. Hook SessionEnd / idle_prompt détecte
3. Backend envoie message Telegram : "Facture avril prête à valider → [Voir dans l'app]"
**Attendu** : message reçu sur Telegram avec lien vers l'app web

### E2E-NTF-02 : MFA bloquant → notification Telegram
**Steps** :
1. Claude se bloque sur un MFA
2. Checkpoint écrit, notification envoyée
**Attendu** : "Bloqué sur exali.com (MFA) → [Intervenir]"

### E2E-NTF-03 : Dossier terminé → notification Telegram
**Steps** :
1. Claude termine un dossier (state.md STATUS: COMPLETED)
**Attendu** : notification "Dossier 'Comptable belge' terminé"

### E2E-NTF-04 : Suggestion urgente → notification Telegram
**Steps** :
1. Claude crée une suggestion avec URGENCE: urgent
**Attendu** : notification Telegram avec lien vers l'app

### E2E-NTF-05 : Suggestion normale → PAS de notification Telegram
**Steps** :
1. Claude crée une suggestion avec URGENCE: normal
**Attendu** : PAS de notification. Visible dans l'app uniquement.

### E2E-NTF-06 : Action externe loggée → notification informative
**Steps** :
1. Claude envoie un email de relance (ALLOW par le hook)
**Attendu** : notification "Relance envoyée à Sopra pour timesheet mai"

### E2E-NTF-08 : Échec d'envoi Telegram → retry
**Steps** :
1. Backend tente d'envoyer une notification Telegram
2. Telegram API retourne une erreur (réseau, rate limit)
**Attendu** : retry avec backoff (3 tentatives max), pas de perte de notification. Après 3 échecs, log d'erreur.

### E2E-NTF-09 : Anti-spam notifications
**Préconditions** : 20 events arrivent en 30 secondes
**Steps** :
1. Chaque event déclenche potentiellement une notification
**Attendu** : les notifications sont groupées ou rate-limitées (ex: "5 nouveaux events, voir dans l'app"), pas 20 messages Telegram en 30s

### E2E-NTF-07 : Notification contient un lien vers l'app
**Steps** :
1. N'importe quelle notification est envoyée
**Attendu** : le message contient un lien cliquable vers la page pertinente de l'app

---

## 7. SUGGESTIONS 🧪

**Fichier** : `apps/backend/tests/suggestions/*.test.ts`
**Mock** : Claude (crée des fichiers suggestion selon le scénario)
**Setup** : workspace temporaire avec `_suggestions/`

```bash
pnpm test tests/suggestions/
```

### E2E-SUG-01 : Suggestion créée par triage event
(Couvert par E2E-RCV-02)

### E2E-SUG-02 : Suggestion créée par sweep
**Steps** :
1. Cron sweep lance Claude
2. Claude scanne les emails non traités et détecte un email important sans dossier
3. Claude crée `_suggestions/email-important.md`
**Attendu** : suggestion avec source "Sweep", urgence estimée, résumé

### E2E-SUG-03 : Suggestion créée en travaillant sur un autre dossier
**Steps** :
1. Claude travaille sur `factures-sopra`
2. En lisant un email, il remarque un sujet lié à un autre besoin
3. Claude crée une suggestion dans `_suggestions/`
**Attendu** : suggestion créée, travail sur factures-sopra continue normalement

### E2E-SUG-04 : Format suggestion complet
**Steps** :
1. Vérifier une suggestion créée par Claude
**Attendu** : contient URGENCE, SOURCE, DATE, Résumé, Pourquoi, Ce que je ferais

### E2E-SUG-05 : Suggestion approuvée → dossier + session
(Couvert par E2E-WS-02)

### E2E-SUG-06 : Suggestion ignorée → supprimée
(Couvert par E2E-WS-03)

### E2E-SUG-08 : Suggestion approuvée avec instructions personnalisées
**Préconditions** : suggestion `_suggestions/impots-chypre.md` existe
**Steps** :
1. L'utilisateur ouvre la suggestion dans l'app
2. Clique "Créer le dossier" et ajoute une instruction : "Focalise-toi sur le formulaire TD1, pas les autres documents"
3. Dossier créé avec le contexte de la suggestion + l'instruction de l'utilisateur
**Attendu** : state.md contient à la fois le résumé de la suggestion ET l'instruction personnalisée de l'utilisateur

### E2E-SUG-09 : Sweep crée plusieurs suggestions d'un coup
**Steps** :
1. Cron sweep lance Claude
2. Claude détecte 3 situations qui nécessitent des dossiers
3. Crée 3 fichiers dans `_suggestions/`
**Attendu** : 3 suggestions distinctes, chacune avec son slug unique, urgence, source

### E2E-SUG-07 : Pas de suggestion dupliquée
**Steps** :
1. Même event (email des impôts) arrive 2 fois
2. 1ère fois → suggestion créée
3. 2ème fois → Claude voit que la suggestion existe déjà
**Attendu** : pas de 2e suggestion, éventuellement mise à jour de l'existante

---

## 8. AMÉLIORATIONS (ex-Gaps) 🧪

**Fichier** : `apps/backend/tests/ameliorations/*.test.ts`
**Mock** : Claude (écrit dans gaps.md selon le scénario)
**Setup** : workspace temporaire avec `_gaps/gaps.md` fixtures

```bash
pnpm test tests/ameliorations/
```

### E2E-AML-01 : Claude détecte une limite et l'écrit
**Steps** :
1. Claude travaille sur exali.com et se bloque sur MFA TOTP
2. Claude ne peut pas avancer → écrit dans `workspace/_gaps/gaps.md`
3. Entrée contient : date, problème, impact, suggestion
**Attendu** : nouvelle entrée dans gaps.md

### E2E-AML-02 : Limite visible dans l'app
**Préconditions** : gaps.md contient 3 entrées
**Steps** :
1. Ouvrir la page Améliorations
**Attendu** : 3 cartes, chacune avec titre, description, impact, suggestion, lien dossier

### E2E-AML-03 : Marquer une amélioration comme résolue
**Steps** :
1. Ouvrir la page Améliorations
2. Cliquer "Marquer résolu" sur une entrée
**Attendu** : entrée marquée comme résolue, filtrée par défaut, visible via filtre "Résolues"

### E2E-AML-04 : Pas de doublon dans gaps.md
**Steps** :
1. Claude se bloque 3 fois sur le même MFA exali
**Attendu** : une seule entrée dans gaps.md (ou mise à jour de l'existante), pas 3

---

## 9. SESSION LIFECYCLE : Idle, timeout, resume 🧪

**Fichier** : `apps/backend/tests/session-lifecycle/*.test.ts`
**Mock** : Claude CLI, tmux (`send-keys` vérifié mais pas exécuté), timers (fake timers vitest)
**Setup** : workspace temporaire, `.session-id` fixtures

```bash
pnpm test tests/session-lifecycle/
```

### E2E-SLC-01 : Claude idle → hook idle_prompt → notification
**Steps** :
1. Claude attend un input (checkpoint question)
2. Hook `Notification` matcher `idle_prompt` se déclenche
3. Backend notifie Telegram
4. Timer démarre (1h par défaut)
**Attendu** : notification envoyée, timer actif

### E2E-SLC-02 : L'utilisateur répond avant timeout
**Préconditions** : Claude idle, timer actif
**Steps** :
1. L'utilisateur ouvre le terminal (tmux attach)
2. Répond à la question
3. Claude continue le travail
**Attendu** : pas de timeout, session continue normalement, timer annulé

### E2E-SLC-03 : Timeout expiré → sauvegarde et fin
**Préconditions** : Claude idle, timer actif, l'utilisateur ne répond pas
**Steps** :
1. Timer expire (1h)
2. Backend envoie `tmux send-keys` : "Timeout, sauvegarde ton état et termine"
3. Claude met à jour state.md avec son état précis
4. Claude quitte proprement
5. Lock libéré
**Attendu** : state.md à jour, session terminée, lock libéré, session_id sauvé pour resume

### E2E-SLC-04 : Resume après timeout
**Préconditions** : session précédente terminée par timeout, `.session-id` sauvé
**Steps** :
1. L'utilisateur répond au checkpoint (via l'app ou un event)
2. Launcher lance `claude --resume <session-id>`
3. Claude reprend avec historique compacté
**Attendu** : Claude sait où il en était, continue le travail

### E2E-SLC-05 : Hook Stop détecte fin de réponse
**Steps** :
1. Claude finit de répondre (plus de tokens en sortie)
2. Hook `Stop` se déclenche
**Attendu** : hook détecte la fin, permet au backend de vérifier l'état

### E2E-SLC-06 : Session.id persisté dans le dossier
**Steps** :
1. Session lancée pour `factures-sopra`
2. Session ID écrit dans `workspace/factures-sopra/.session-id`
**Attendu** : fichier existe, contient le bon session ID pour resume futur

---

## 10. CRON SWEEP 🧪

**Fichier** : `apps/backend/tests/launcher/sweep.test.ts`
**Mock** : Claude (sweep simulé qui retourne quels dossiers ont besoin d'action)
**Setup** : workspace temporaire avec plusieurs dossiers à différents états

```bash
pnpm test tests/launcher/sweep.test.ts
```

### E2E-CRN-01 : Sweep périodique lance des sessions focalisées
**Préconditions** : 3 dossiers actifs, 1 avec deadline dans 2 jours, 1 avec relance à faire, 1 à jour
**Steps** :
1. Cron déclenche le sweep
2. Claude sweep lit les state.md
3. Identifie 2 dossiers qui ont besoin d'action
4. Lance 2 sessions focalisées
**Attendu** : 2 sessions lancées, le 3e dossier ignoré

### E2E-CRN-02 : Sweep skip les dossiers lockés
(Couvert par E2E-LCH-08)

### E2E-CRN-03 : Sweep détecte une deadline proche
**Préconditions** : state.md de `exali-rapport` mentionne deadline dans 3 jours
**Steps** :
1. Sweep lance Claude
2. Claude lit les state.md, voit la deadline
3. Lance une session focalisée pour avancer
**Attendu** : session lancée avec priorité appropriée

### E2E-CRN-04 : Sweep détecte une relance à faire
**Préconditions** : state.md de `factures-sopra` mentionne "relancer si pas de réponse avant le 16/03"
**Steps** :
1. Sweep le 17/03
2. Claude voit que la date est dépassée
3. Lance une session pour envoyer la relance
**Attendu** : session lancée, relance envoyée (via le flux normal avec hooks)

### E2E-CRN-05 : Sweep crée des suggestions
**Steps** :
1. Sweep scan les emails/events récents non traités
2. Trouve des éléments qui ne matchent aucun dossier
3. Crée des suggestions dans `_suggestions/`
**Attendu** : suggestions créées, pas de dossiers

### E2E-CRN-06 : Sweep quand rien à faire
**Préconditions** : tous les dossiers à jour, pas d'action requise
**Steps** :
1. Cron déclenche le sweep
2. Claude scanne tout → rien à faire
**Attendu** : pas de session lancée, log "rien à faire"

---

## 11. INFRASTRUCTURE 🧪

**Fichier** : `apps/backend/tests/infra/*.test.ts`
**Mock** : minimal (locks et dedup sont testés directement)
**Setup** : dossier temporaire pour locks, fichier temporaire pour audit

```bash
pnpm test tests/infra/
```

### E2E-INF-01 : Resource lock, Chrome/browser
**Steps** :
1. Session 1 utilise Camoufox avec profil A
2. Session 2 utilise Camoufox avec profil B
**Attendu** : les 2 fonctionnent en parallèle (profils isolés, plus de lock browser global)

### E2E-INF-02 : Lock PID, process mort nettoyé
**Steps** :
1. Session crash, lock PID reste dans `/tmp/opentidy-locks/`
2. Nouveau trigger pour le même dossier
3. Launcher vérifie le PID → process mort
4. Nettoie le lock, relance
**Attendu** : pas de blocage permanent

### E2E-INF-03 : Audit trail, toutes les actions externes loggées
**Steps** :
1. Exécuter une série d'actions : email envoyé, clic browser, relance
2. Vérifier `workspace/_audit/actions.log`
**Attendu** : chaque action externe a une entrée avec timestamp, tool, params, session, ALLOW/DENY

### E2E-INF-04 : Retry/backoff sur erreur Claude
**Steps** :
1. Claude reçoit une erreur 429 (rate limit)
2. Backoff exponentiel, retry
**Attendu** : session reprend après le backoff, pas de crash

### E2E-INF-05 : Dedup event par content hash
(Couvert par E2E-RCV-03)

---

## 12. FLUX COMPLETS END-TO-END 🔥

Ces tests utilisent le vrai backend et la vraie app web. Claude peut être réel ou simulé
selon le scénario. Chaque test est une commande `/test` à lancer dans Claude Code.

**Pré-requis** :
```bash
pnpm smoke:setup    # crée workspace de test avec fixtures
pnpm smoke:start    # lance backend + frontend en mode smoke test
```

### E2E-FULL-01 : Flux complet : email → dossier existant → action → audit

**`/test` commande** :
```
/test Envoie un webhook Gmail POST /api/webhook/gmail avec un email de billing@soprasteria.com
(sujet: "Timesheet juin"). Vérifie que :
1. Le backend accepte le webhook (200)
2. Le fichier workspace/factures-sopra/state.md est modifié (nouvelle entrée)
3. Une session tmux "factures-sopra" existe (tmux list-sessions)
4. Le fichier workspace/_audit/actions.log contient une entrée récente
5. L'app web sur / affiche une session active pour "factures-sopra"
```

### E2E-FULL-02 : Flux complet : email nouveau → suggestion → approbation → travail → terminé

**`/test` commande** :
```
/test Envoie un webhook Gmail POST /api/webhook/gmail avec un email de tax@cyprus.gov.cy
(sujet: "Tax declaration deadline"). Vérifie que :
1. Aucun dossier "impots-chypre" n'est créé dans workspace/
2. Un fichier workspace/_suggestions/impots-chypre*.md existe avec URGENCE: urgent
3. L'app web sur / affiche la suggestion dans la section "Suggestions"
4. Clique sur "Créer le dossier" dans l'app web
5. Vérifie qu'un dossier workspace/impots-chypre/ existe maintenant avec un state.md
6. La suggestion a été supprimée de workspace/_suggestions/
7. L'app web sur /dossiers affiche le nouveau dossier
```

### E2E-FULL-03 : Flux complet : instruction utilisateur → dossier → checkpoint

**`/test` commande** :
```
/test Dans l'app web, va sur /nouveau. Tape l'instruction "Rapport exali annuel 2025"
et clique "Lancer". Vérifie que :
1. Un dossier workspace/rapport-exali*/ est créé avec un state.md
2. L'app redirige vers la page du dossier /dossier/<id>
3. Le state.md contient l'objectif "Rapport exali"
4. Une session tmux existe pour ce dossier (tmux list-sessions)
5. Un lock existe dans /tmp/opentidy-locks/
```

### E2E-FULL-04 : Flux complet : sweep → détection deadline → travail autonome

**`/test` commande** :
```
/test Vérifie le workspace : le dossier workspace/exali-rapport/ a un state.md qui
mentionne une deadline dans 3 jours. Déclenche un sweep via POST /api/sweep.
Vérifie que :
1. Une session tmux est lancée pour exali-rapport
2. Le state.md est mis à jour après le traitement
3. L'app web sur / montre une session active pour exali-rapport dans "En fond"
```

### E2E-FULL-05 : Flux complet : sweep → rien à faire → silence

**`/test` commande** :
```
/test Vérifie que tous les dossiers dans workspace/ ont STATUS: COMPLETED ou sont à jour.
Déclenche un sweep via POST /api/sweep. Vérifie que :
1. Aucune nouvelle session tmux n'est créée
2. Aucune notification n'est envoyée (vérifier GET /api/notifications/recent → vide)
3. L'app web sur / affiche le mode zen (orbe, "Tout roule")
```

### E2E-FULL-06 : Flux complet : hook DENY → Claude s'adapte

**`/test` commande** :
```
/test Vérifie qu'un dossier avec une session active existe. Dans le workspace de ce
dossier, vérifie que si Claude tente une action bloquée par le hook (ex: gmail.send
vers un destinataire inconnu), le hook retourne DENY. Vérifie que :
1. Le fichier workspace/_audit/actions.log contient une entrée DENY
2. Un checkpoint.md est créé dans le dossier (Claude demande l'aide de l'utilisateur)
3. L'app web affiche le checkpoint dans la section "Pour toi"
4. Le bouton "Ouvrir le terminal" est présent
```

### E2E-FULL-07 : Flux complet : timeout idle → resume → continuation

**`/test` commande** :
```
/test Vérifie qu'un dossier a un checkpoint.md en attente et un fichier .session-id.
Simule un timeout via POST /api/session/<id>/timeout. Vérifie que :
1. Le state.md est mis à jour avec l'état de sauvegarde
2. Le lock est libéré
3. Le .session-id est préservé
4. Déclenche un resume via POST /api/dossier/<id>/resume
5. Une nouvelle session tmux est lancée avec --resume
6. L'app web montre la session comme active à nouveau
```

### E2E-FULL-08 : Flux complet : 3 sessions parallèles sans interférence

**`/test` commande** :
```
/test Crée 3 dossiers via l'app web /nouveau : "Test A", "Test B", "Test C".
Vérifie que :
1. 3 dossiers distincts existent dans workspace/
2. 3 sessions tmux distinctes tournent (tmux list-sessions | grep test)
3. 3 locks PID distincts existent dans /tmp/opentidy-locks/
4. L'app web sur / affiche 3 sessions actives dans "En fond"
5. Chaque dossier a son propre state.md indépendant
```

### E2E-FULL-09 : Flux complet : Claude découvre un gap en travaillant

**`/test` commande** :
```
/test Vérifie qu'un dossier a une session active. Après le travail de Claude,
vérifie que :
1. workspace/_gaps/gaps.md contient une nouvelle entrée (si Claude a rencontré une limite)
2. Un checkpoint.md existe dans le dossier (intervention manuelle)
3. L'app web /ameliorations affiche la nouvelle entrée dans gaps
4. L'app web / affiche le checkpoint dans "Pour toi"
5. Les deux sont indépendants (résoudre le checkpoint ne résout pas le gap)
```

### E2E-FULL-11 : Flux complet : échange de fichiers utilisateur ↔ Claude

**`/test` commande** :
```
/test Ouvre un dossier qui a un checkpoint demandant des photos.
Dans l'app web /dossier/<id> :
1. Upload 2 images via le formulaire d'upload
2. Vérifie que les fichiers apparaissent dans workspace/<dossier>/artifacts/
3. Vérifie que les fichiers sont listés dans la sidebar de la page dossier
4. Déclenche un resume de la session
5. Vérifie que le state.md mentionne les fichiers reçus après traitement
```

### E2E-FULL-12 : Flux complet : premier lancement, workspace vide

**`/test` commande** :
```
/test Supprime le workspace de test (rm -rf workspace/*).
Redémarre le backend (POST /api/restart ou relance le process).
Ouvre l'app web. Vérifie que :
1. Pas de crash, pas d'erreur dans la console
2. La home affiche le mode zen (pas de checkpoints, pas de suggestions)
3. La page /dossiers affiche un état vide avec un message d'accueil
4. Aller sur /nouveau, créer un dossier "Premier test"
5. Le dossier est créé, workspace/ contient la structure complète
6. Retour sur / → le dossier apparaît dans "En fond"
```

### E2E-FULL-13 : Flux complet : backend restart avec sessions en cours

**`/test` commande** :
```
/test Vérifie que des sessions tmux sont actives (tmux list-sessions).
Note les sessions et locks actuels.
Redémarre le backend (kill + restart ou POST /api/restart).
Après redémarrage, vérifie que :
1. Les sessions tmux sont toujours actives (indépendantes du backend)
2. Les locks dans /tmp/opentidy-locks/ sont cohérents avec les sessions tmux
3. L'app web / affiche les sessions actives correctement
4. Aucun lock orphelin (PID mort) ne persiste
```

### E2E-FULL-10 : Flux complet : Claude ne crée jamais de dossier seul

**`/test` commande** :
```
/test Envoie 5 webhooks Gmail différents avec des sujets variés (facture, impôts,
assurance, rendez-vous, demande client) vers POST /api/webhook/gmail.
Aucun dossier existant ne matche ces emails. Après traitement, vérifie que :
1. AUCUN nouveau dossier n'a été créé dans workspace/ (ls workspace/ sans _*)
2. Des suggestions existent dans workspace/_suggestions/ (au moins 3)
3. L'app web / affiche les suggestions, pas des dossiers actifs
4. Chaque suggestion a un fichier .md avec URGENCE, SOURCE, Résumé
```

---

## 13. EDGE CASES 🧪

**Fichier** : `apps/backend/tests/edge-cases/*.test.ts`
**Mock** : Claude, Telegram, filesystem (certains tests simulent des crashes)
**Setup** : workspace temporaire, conditions dégradées simulées

```bash
pnpm test tests/edge-cases/
```

### E2E-EDGE-01 : Event arrive pendant un sweep en cours
**Steps** :
1. Sweep est en cours (session Claude active)
2. Webhook Gmail arrive
3. Receiver crée l'event normalement
**Attendu** : event traité indépendamment du sweep (session séparée ou en attente)

### E2E-EDGE-02 : L'utilisateur crée un dossier avec le même nom qu'une suggestion
**Steps** :
1. Suggestion `_suggestions/impots-chypre.md` existe
2. L'utilisateur crée manuellement un dossier "impots-chypre" via la page Nouveau
**Attendu** : dossier créé, suggestion devrait être auto-nettoyée ou signalée comme obsolète

### E2E-EDGE-03 : Checkpoint écrit mais session crash avant notification
**Steps** :
1. Claude écrit checkpoint.md
2. Session crash avant que le hook SessionEnd notifie
**Attendu** : au prochain sweep/event, le checkpoint est détecté et la notification envoyée

### E2E-EDGE-04 : State.md corrompu / vide
**Steps** :
1. State.md est vidé accidentellement (crash mid-write)
2. Session suivante pour ce dossier
**Attendu** : Claude détecte le problème, reconstitue ce qu'il peut via session-id/historique, signale le problème

### E2E-EDGE-05 : Plusieurs checkpoints en même temps
**Préconditions** : 3 dossiers ont chacun un checkpoint
**Steps** :
1. Ouvrir la Home
**Attendu** : les 3 checkpoints affichés dans la section "Pour toi", chacun avec son contexte

### E2E-EDGE-06 : Rate limit Claude Max
**Steps** :
1. Le système tente de lancer une 4e session parallèle
2. Claude Max rate limit atteint
**Attendu** : backoff, retry, pas de crash. La session est mise en attente.

### E2E-EDGE-07 : Webhook Gmail flood (100 emails en 1 minute)
**Steps** :
1. 100 webhooks arrivent rapidement
2. Dedup filtre les doublons
3. Restant traité séquentiellement ou en parallèle limité
**Attendu** : pas de crash, pas de sessions infinies, dedup fonctionne

### E2E-EDGE-08 : L'utilisateur modifie un state.md manuellement
**Steps** :
1. L'utilisateur édite directement `workspace/factures-sopra/state.md` dans un éditeur
2. Prochaine session Claude pour ce dossier
**Attendu** : Claude lit le state.md modifié et s'adapte aux changements

### E2E-EDGE-09 : Suggestion pour un dossier qui vient d'être créé
**Steps** :
1. Un event crée une suggestion
2. Pendant ce temps, l'utilisateur a déjà créé un dossier pour le même sujet
3. Le triage d'un prochain event similaire devrait router vers le dossier
**Attendu** : la suggestion devient obsolète, les events suivants sont routés vers le dossier

### E2E-EDGE-10 : Dossier sans session depuis longtemps
**Préconditions** : dossier actif mais dernière session il y a 2 semaines
**Steps** :
1. Sweep détecte le dossier dormant
**Attendu** : sweep lance une session pour vérifier si le dossier est encore pertinent ou à clôturer

### E2E-EDGE-11 : Hook DENY en boucle
**Steps** :
1. Claude essaie une action → DENY
2. Claude réessaie autrement → DENY
3. Claude réessaie encore → DENY
**Attendu** : après N tentatives DENY, Claude devrait créer un checkpoint demandant l'aide de l'utilisateur, pas boucler

### E2E-EDGE-12 : Camoufox profil corrompu
**Steps** :
1. Session avec profil Camoufox corrompu (cookies invalides, crash browser)
**Attendu** : Claude détecte le problème, peut recréer un profil ou signaler dans gaps.md

### E2E-EDGE-14 : Checkpoint.md malformé ou vide
**Steps** :
1. Claude crash mid-write, checkpoint.md est vide ou tronqué
2. Hook SessionEnd tente de lire le checkpoint
**Attendu** : notification avec message dégradé ("Checkpoint incomplet sur [dossier], vérifier manuellement"), pas de crash backend

### E2E-EDGE-15 : Double-clic sur "Créer le dossier" (concurrence)
**Steps** :
1. L'utilisateur double-clique rapidement sur "Créer le dossier" d'une suggestion
2. 2 requêtes partent vers le backend
**Attendu** : 1 seul dossier créé, pas de doublon. La 2e requête est ignorée ou retourne une erreur gracieuse.

### E2E-EDGE-16 : State.md avec statut non reconnu
**Steps** :
1. state.md contient `STATUS: EN PAUSE` (valeur non prévue)
2. App web tente de l'afficher
**Attendu** : affichage dégradé (statut "inconnu" ou texte brut), pas de crash. Claude traite le dossier normalement.

### E2E-EDGE-17 : Erreur disque pendant écriture
**Steps** :
1. Disque plein pendant que Claude écrit state.md
**Attendu** : erreur détectée, notification d'alerte, session ne crash pas silencieusement

### E2E-EDGE-18 : Backend restart avec locks orphelins
**Préconditions** : backend crash, locks PID dans `/tmp/opentidy-locks/` dont certains avec PID morts
**Steps** :
1. Backend redémarre
2. Scan des locks au boot
**Attendu** : locks avec PID morts nettoyés automatiquement, locks avec PID vivants conservés

### E2E-EDGE-13 : Lock stale détecté par le sweep
**Steps** :
1. Lock existe dans `/tmp/opentidy-locks/` mais le PID est mort
2. Sweep ou event pour ce dossier
3. Lock détecté comme stale → nettoyé
**Attendu** : dossier à nouveau disponible pour une session
