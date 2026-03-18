# Architecture V2 — Vue complète

**Statut** : Brouillon en cours de réflexion — pas une spec technique, pas du code.
C'est une vision de ce que le système doit être, basée sur toute notre réflexion.

---

## Vision

Un assistant personnel qui tourne 24/7, capable de gérer des dossiers administratifs
en autonomie. Il travaille méthodiquement en fond, ne dérange Lolo que quand c'est
nécessaire, et peut être amélioré au fil du temps.

Claude Code est le moteur d'exécution. Le reste est de la plomberie minimale.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                     APP WEB                              │
│                                                         │
│  Interface principale de Lolo :                         │
│  - Voir les dossiers en cours et leur état              │
│  - Valider/refuser les actions en attente (previews)    │
│  - Donner des instructions / créer des dossiers         │
│  - Voir ce que Claude fait (debug, logs, historique)    │
│  - Intervenir quand Claude est bloqué (captcha, MFA)    │
│                                                         │
└──────────────────────┬──────────────────────────────────┘
                       │ API
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    BACKEND                               │
│                (~200-400 lignes)                         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │ RECEIVER │  │ LAUNCHER │  │ STATE MGR │             │
│  │          │  │          │  │           │             │
│  │ Webhooks │  │ Lance    │  │ Lit/écrit │             │
│  │ Crons    │  │ Claude   │  │ les       │             │
│  │ App web  │  │ Code     │  │ dossiers  │             │
│  │ requests │  │ sessions │  │           │             │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘             │
│       │              │              │                    │
│  ┌────┴──────────────┴──────────────┴─────┐             │
│  │           INFRASTRUCTURE               │             │
│  │  - Dedup events (content hash)         │             │
│  │  - Resource locks (Chrome, etc.)       │             │
│  │  - Audit trail (actions log)           │             │
│  │  - Crash recovery                      │             │
│  └────────────────────────────────────────┘             │
│                                                         │
│  ┌────────────────────────────────────────┐             │
│  │         NOTIFICATION                   │             │
│  │  Telegram push → Lolo                  │             │
│  │  (liens vers app web pour agir)        │             │
│  └────────────────────────────────────────┘             │
│                                                         │
└──────────────────────┬──────────────────────────────────┘
                       │ lance
                       ▼
┌─────────────────────────────────────────────────────────┐
│              SESSIONS CLAUDE CODE                        │
│                                                         │
│  Session 1: "factures-2025"                             │
│    contexte: workspace/factures-2025/state.md           │
│    outils: Gmail MCP, /comptable, browser               │
│                                                         │
│  Session 2: "exali-rapport"                             │
│    contexte: workspace/exali-rapport/state.md           │
│    outils: browser, Bitwarden                           │
│                                                         │
│  Session 3: "demande-comptable-mars"                    │
│    contexte: workspace/demande-comptable-mars/state.md  │
│    outils: Gmail MCP, fichiers                          │
│                                                         │
│  (N sessions en parallèle, isolées)                     │
│                                                         │
│  Chaque session :                                       │
│  1. Lit son fichier d'état (où j'en suis)               │
│  2. Lit l'event/instruction qui l'a déclenchée          │
│  3. Travaille (skills, MCP, browser)                    │
│  4. Met à jour son état                                 │
│  5. Si besoin de Lolo → écrit un checkpoint + termine   │
│  6. Si fini → met à jour l'état "terminé" + termine     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Composant 1 : RECEIVER (réception des stimuli)

### Ce qu'il fait
Recevoir tout ce qui peut déclencher du travail et le transformer en "event"
uniforme que le système peut traiter.

### Sources d'events

**Events externes (push)**
- Webhook Gmail : nouvel email reçu
- (Futurs : webhook Calendar, Notion, etc.)

**Events externes (polling)**
- SMS : checker les nouveaux messages (toutes les X minutes)
- WhatsApp : checker les nouveaux messages (toutes les X minutes)
- Note : le polling n'a pas besoin d'être rapide (principe #1). Toutes les 5
  minutes suffit largement pour des tâches admin.

**Events internes (crons)**
- Travail de fond périodique : "vérifie les dossiers, avance ce qui peut avancer"
- Deadlines qui approchent : "le rapport exali est dû dans 3 jours"
- Relances : "ça fait 3 jours que Sopra n'a pas répondu au mail"
- Briefing : "prépare un résumé pour Lolo" (optionnel, fréquence à définir)

**Instructions de Lolo**
- Via l'app web : "fais ceci", "crée un nouveau dossier pour ça"
- Via Claude Code interactif : Lolo travaille directement avec Claude
- Via Telegram : réponse à un checkpoint ("oui envoie", "non modifie X")

### Format uniforme d'un event
Peu importe la source, le receiver transforme tout en un objet simple :
- source (gmail, sms, whatsapp, cron, lolo)
- contenu (le texte, le sujet, les données)
- timestamp
- métadonnées (expéditeur, etc.)

### Question ouverte : triage
Quand un event arrive, qui décide quel dossier il concerne et s'il faut
lancer une session Claude ?

Option A : le receiver lance directement une session Claude avec l'event.
Claude décide lui-même si c'est lié à un dossier existant ou si c'est nouveau.
→ Simple mais chaque event = une session Claude (même les spams).

Option B : un triage rapide (Claude ou règles simples) filtre et route avant
de lancer une session complète.
→ Plus efficace mais ajoute une couche.

Pour commencer, Option A est probablement suffisante. On peut optimiser après
si on voit que trop de sessions inutiles sont lancées.

---

## Composant 2 : WORKSPACE (état des dossiers)

### Principe
Chaque dossier en cours a un répertoire dans `workspace/` avec des fichiers
markdown que Claude lit et met à jour. Pas de base de données pour l'état
des dossiers — des fichiers lisibles par l'humain ET par Claude.

### Structure

```
workspace/
├── factures-2025/
│   ├── state.md          # état actuel, prochaines étapes, historique condensé
│   ├── checkpoint.md     # si en attente de Lolo : quoi, pourquoi, options
│   └── artifacts/        # fichiers produits (factures PDF, etc.)
│
├── exali-rapport-2025/
│   ├── state.md
│   ├── checkpoint.md
│   └── artifacts/
│
├── demande-comptable-mars/
│   ├── state.md
│   └── artifacts/
│
├── _inbox/
│   └── events.md         # events non encore rattachés à un dossier
│
├── _gaps/
│   └── gaps.md           # lacunes détectées par Claude (auto-analyse)
│
└── _audit/
    └── actions.log       # historique de toutes les actions externes
```

### Le fichier state.md (cœur du système)

C'est la mémoire de Claude pour ce dossier. Il doit contenir tout ce dont
Claude a besoin pour reprendre le travail dans une nouvelle session, sans
rien d'autre en contexte.

Exemple :

```markdown
# Factures Sopra 2025-2026

## Objectif
Vérifier que toutes les factures mensuelles Sopra Steria ont été envoyées.
Une facture par mois, basée sur les timesheets.

## État actuel
STATUT: EN COURS
Dernière action: 2026-03-13

## Ce qui est fait
- Jan 2025: facture #2025-001 envoyée le 05/02 ✓
- Fév 2025: facture #2025-002 envoyée le 03/03 ✓
- Mar 2025: facture #2025-003 envoyée le 07/04 ✓

## Ce qui reste à faire
- Avr 2025: timesheet trouvé (152h), facture à créer
- Mai 2025: timesheet MANQUANT — email envoyé à Sopra le 12/03

## En attente
- Réponse de Sopra pour le timesheet de mai (relancer si pas de réponse avant le 16/03)

## Contacts
- Sopra billing: billing@soprasteria.com
- Lolo contact Sopra: jean.dupont@soprasteria.com

## Notes
- Format facture: utiliser /comptable avec template Sopra
- Taux: 80€/h HT
- Devise: EUR
```

### Gestion de la taille
Le fichier state.md doit rester concis. Si un dossier accumule trop d'historique,
Claude devrait condenser les anciennes entrées ("Jan-Mar 2025: toutes envoyées ✓")
plutôt que de garder chaque détail.

Question ouverte : qui gère cette condensation ? Claude lui-même à chaque session ?
Un cron de "nettoyage" ? Une règle de taille max ?

### Le fichier checkpoint.md

Quand Claude a besoin de Lolo, il écrit un checkpoint :

```markdown
# Checkpoint — Attente validation

## Ce que j'ai fait
Créé 2 factures pour avril et mai 2025.

## Ce que j'attends de toi
Valider les factures avant envoi.

## Détails
- Facture avril: 152h × 80€ = 12,160€ HT → artifacts/facture-2025-04.pdf
- Facture mai: 160h × 80€ = 12,800€ HT → artifacts/facture-2025-05.pdf

## ⚠️ Anomalies détectées
- Aucune

## Options
1. [Envoyer les deux] → je les envoie à billing@soprasteria.com
2. [Modifier] → dis-moi ce qu'il faut changer
3. [Annuler] → j'annule et j'attends tes instructions
```

L'app web lit ce fichier et le présente à Lolo de manière lisible.
Quand Lolo répond, le backend relance Claude avec la réponse.

---

## Composant 3 : LAUNCHER (lancement des sessions Claude)

### Ce qu'il fait
Lancer des sessions Claude Code avec le bon contexte pour un dossier donné.

### Comment il lance Claude

Question ouverte majeure (nécessite des tests) :

**Option A : `claude -p` (print mode)**
```bash
claude -p --resume "session-factures" "
  Lis workspace/factures-2025/state.md pour comprendre où tu en es.
  Nouvel event: [contenu de l'event]
  Travaille sur ce dossier. Met à jour state.md quand tu as fini.
  Si tu as besoin de Lolo, écris un checkpoint.md et termine.
"
```
- ✅ Clean, programmatique, facile à orchestrer
- ❌ Pas d'interaction mid-session (problème MFA/captcha)
- ❌ Incertain sur le support des skills et du browser en mode print

**Option B : Session tmux**
Lance Claude dans un tmux détaché. Claude tourne, et si besoin, Lolo peut
attacher le terminal pour intervenir.
- ✅ Interaction possible mid-session
- ✅ Fonctionne déjà en V1
- ❌ Plus complexe à orchestrer
- ❌ L'intervention de Lolo est moins mobile-friendly

**Option C : Hybride**
- Print pour les tâches sans interaction (lecture, analyse, emails)
- Tmux pour les tâches avec browser/interaction probable
- ✅ Meilleur des deux mondes
- ❌ Faut décider du mode à l'avance (ou laisser le système/Claude choisir)

### Parallélisme
Plusieurs sessions Claude en même temps, chacune sur un dossier différent.
Les conflits de ressources (Chrome, etc.) sont gérés par les locks du système.

Si un Claude veut Chrome et qu'un autre l'utilise, il attend ou il fait
autre chose en attendant — c'est géré par les locks et le retry.

### Contexte chargé dans chaque session
Pour chaque session, Claude reçoit :
1. Le fichier state.md du dossier (où j'en suis)
2. L'event ou l'instruction qui a déclenché la session
3. Un prompt système minimal ("tu es l'assistant de Lolo, voici comment
   tu travailles, voici les garde-fous")

C'est tout. Pas de contexte global, pas de tous-les-dossiers-en-même-temps.
Session focalisée = meilleure qualité.

---

## Composant 4 : GARDE-FOUS

### Le problème
Claude a accès à tout. Une erreur (facture erronée, mauvaise réponse aux impôts)
a des conséquences réelles et potentiellement graves.

Le cas le plus dangereux : Claude est CONFIANT mais a TORT.

### Approche envisagée : défense en couches

**Couche 1 : Hard stops (techniques, incontournables)**
Certaines actions sont TOUJOURS bloquées sans approbation explicite de Lolo.
Pas de jugement de Claude — c'est un mur technique.

Exemples :
- Tout paiement / virement
- Toute réponse à une administration (fiscale, gouvernementale)
- Toute signature de document
- Tout engagement contractuel
- Tout montant supérieur à un seuil (ex: facture > X€)

Ces règles sont peu nombreuses, stables, et encodées dans le système.
Elles sont le filet de sécurité ultime.

Comment les implémenter techniquement ? Question ouverte.
Possibilités :
- Prompt système qui dit "JAMAIS faire X sans approbation"
  → Mais Claude peut ignorer un prompt (hallucination, contexte long)
- Hooks Claude Code qui interceptent certains tool calls
  → Plus technique mais plus fiable
- Les outils eux-mêmes qui refusent (le CLI gmail refuse d'envoyer
  sans un flag --approved)
  → Le plus sûr mais nécessite de modifier les outils

**Couche 2 : Preview + anomaly detection (pour les actions à risque moyen)**
Claude prépare l'action, génère un preview lisible avec les données clés,
et signale les anomalies qu'il détecte :

```
📧 Envoi de facture
  Destinataire: billing@sopra.com
  Montant: 12,800€ HT
  Période: Avril 2025
  Heures: 160h

  ⚠️ Ce montant est 15% supérieur au mois précédent.

  [Envoyer] [Modifier] [Annuler]
```

Le ⚠️ est crucial : Claude détecte ce qui est inhabituel et le flag, même
s'il n'est pas sûr que c'est un problème. Ça donne à Lolo un signal clair
pour concentrer son attention.

L'app web affiche ces previews. Lolo peut valider d'un tap sur mobile.

Actions concernées : factures, emails formels, soumissions de formulaires,
uploads de documents.

**Couche 3 : Faire + informer (pour les actions à faible risque)**
Claude agit en autonomie et informe Lolo après coup.
"J'ai relancé Sopra pour le timesheet de mai."
"J'ai archivé les emails traités."

Lolo voit ça dans le résumé quotidien ou dans l'app web. S'il y a un problème,
il peut corriger.

Actions concernées : relances à des contacts connus, organisation de fichiers,
mises à jour de dossiers internes.

**Couche 4 : Silencieux (risque zéro)**
Claude fait sans informer : lecture, analyse, recherche, mise à jour d'état interne.

### Qui détermine la couche ?
Claude évalue le risque lui-même (il connaît le domaine, le contexte, le destinataire).
MAIS les hard stops de la couche 1 sont des murs techniques que Claude ne peut pas
contourner, même s'il pense que c'est safe.

C'est la combinaison des deux qui est puissante :
- Claude est intelligent pour 95% des décisions (couches 2-3-4)
- Les hard stops attrapent les 5% critiques (couche 1)

### Idée complémentaire : double-check pour les actions moyennes
Avant d'envoyer une facture (couche 2), lancer un deuxième Claude rapide qui
vérifie : "Est-ce que le montant est cohérent ? Le destinataire est correct ?
Les données correspondent au timesheet ?"

Si le deuxième Claude trouve une anomalie → ajouter un ⚠️ dans le preview.
Si les deux sont d'accord et pas d'anomalie → peut-être auto-envoyer ?

À réfléchir. Ça double les sessions mais ça attrape des erreurs.
Et vu que le coût et la vitesse ne sont pas des contraintes...

### Question non résolue : la confiance progressive
Est-ce qu'avec le temps, certaines actions "preview" deviennent "faire + informer" ?
Ex: après 6 mois de factures Sopra toujours validées, est-ce que Claude peut les
envoyer directement ?

Intéressant mais dangereux. Un mois, le timesheet est faux et la facture part
automatiquement. Peut-être que les factures restent TOUJOURS en preview.
À discuter avec Lolo.

---

## Composant 5 : APP WEB

### Rôle
Interface principale de Lolo pour interagir avec l'assistant.
Remplace le combo Telegram+Dashboard de V1.

### Vues principales

**Vue "Tableau de bord"**
- Dossiers en cours avec leur état (en cours, en attente de Lolo, bloqué, terminé)
- Actions en attente de validation (previews avec boutons)
- Notifications récentes
- Activité en cours (sessions Claude qui tournent)

**Vue "Dossier"**
- État détaillé du dossier (state.md rendu en HTML)
- Historique des actions sur ce dossier
- Checkpoint en cours (si en attente)
- Artifacts (factures, documents produits)
- Bouton "donner une instruction" pour ce dossier

**Vue "Instructions"**
- Créer un nouveau dossier ("je veux que tu gères ça")
- Envoyer une instruction libre ("vérifie tel truc")

**Vue "Debug/Logs"**
- Sessions Claude en cours (et possibilité de voir le terminal ?)
- Historique des actions (audit trail)
- Gaps détectés par Claude (auto-analyse)
- Erreurs et blocages

### Intervention sur captcha/MFA
Quand Claude est bloqué par un captcha ou MFA :
- L'app web montre un screenshot du blocage
- Lolo peut entrer le code / résoudre le captcha via l'interface
- Le backend transmet à Claude qui continue

Question ouverte : comment techniquement ? Options :
- Screenshot polling (Claude prend des screenshots, l'app les affiche)
- VNC/noVNC (stream video du browser de Claude)
- Claude écrit "j'ai besoin du code MFA pour facture.net" et Lolo le tape
  dans un champ de l'app web

### Mobile
L'app doit être utilisable sur téléphone pour les validations rapides.
Pas besoin d'être une app native — une PWA responsive suffit.

---

## Composant 6 : NOTIFICATIONS (Telegram)

### Rôle réduit
Telegram n'est plus l'interface principale. Il sert uniquement de **push notification**
vers Lolo avec un lien vers l'app web.

### Types de notifications
- "🔔 Facture avril prête à valider → [Voir dans l'app]"
- "⚠️ Bloqué sur exali.com (MFA) → [Intervenir]"
- "✅ Relance envoyée à Sopra pour timesheet mai"
- "🚨 Email urgent des impôts chypriotes → [Voir]"

### Pourquoi garder Telegram
Les push notifications sont essentielles — Lolo ne va pas checker l'app web
en permanence. Telegram est déjà configuré, fiable, fonctionne sur mobile.
Alternative future : notifications push de la PWA.

---

## Composant 7 : AUTO-ANALYSE

### Principe
Quand Claude n'arrive pas à faire quelque chose, il l'écrit dans
`workspace/_gaps/gaps.md` au lieu de rester silencieux ou d'halluciner.

### Format
```markdown
## 2026-03-14 — Connexion exali.com
Problème: Le site demande un MFA par app mobile (authenticator).
Je n'ai pas accès à l'app authenticator de Lolo.
Impact: Je ne peux pas remplir le rapport annuel.
Suggestion: Ajouter un skill pour lire les codes TOTP, ou configurer
  un accès alternatif.

## 2026-03-15 — Format de facture Sopra
Problème: Sopra a changé leur template de facturation (nouveau champ
  "numéro de commande" obligatoire). J'ai vu le nouveau format dans
  leur dernier email mais /comptable ne le gère pas encore.
Impact: Je ne peux pas créer de factures conformes au nouveau format.
Suggestion: Mettre à jour le skill /comptable pour inclure le champ
  numéro de commande.
```

### Usage
Lolo consulte ce fichier quand il veut améliorer l'assistant. C'est un
backlog naturel d'améliorations, généré par l'usage réel.

---

## Flux principaux

### Flux 1 : Event externe → action

```
1. Gmail webhook → RECEIVER reçoit "nouvel email de comptable@cabinet.com"
2. RECEIVER dédup → pas un doublon → crée un event
3. LAUNCHER lance Claude avec :
   - L'event (email reçu)
   - Le prompt : "Lis cet email, détermine s'il est lié à un dossier
     existant (regarde workspace/), et agis en conséquence."
4. Claude :
   a. Lit l'email (Gmail MCP)
   b. Regarde les dossiers workspace/ → matche "demande-comptable"
   c. Lit workspace/demande-comptable/state.md
   d. Prépare la réponse avec les justificatifs demandés
   e. C'est une action moyenne → écrit un checkpoint.md avec le preview
   f. Met à jour state.md
   g. Se termine
5. NOTIFICATION → Telegram : "📧 Réponse préparée pour la comptable → [Voir]"
6. Lolo ouvre l'app web → voit le preview → tape [Envoyer]
7. LAUNCHER relance Claude avec : "Lolo a validé, envoie la réponse"
8. Claude envoie l'email via Gmail MCP
9. Met à jour state.md → "réponse envoyée le 14/03"
10. NOTIFICATION → "✅ Réponse envoyée à la comptable"
```

### Flux 2 : Travail de fond (cron)

```
1. Cron toutes les heures → LAUNCHER lance Claude avec :
   "Vérifie les dossiers workspace/. Y a-t-il des relances à faire ?
    Des deadlines qui approchent ? Du travail à avancer ?"
2. Claude :
   a. Parcourt les dossiers
   b. Voit que Sopra n'a pas répondu depuis 3 jours → envoie une relance
      (action faible risque → fait + informe)
   c. Voit que le rapport exali est dû dans 5 jours → commence à préparer
   d. Voit que la facture d'avril est validée mais pas encore envoyée →
      ERREUR : ça aurait dû être fait. Notifie Lolo.
   e. Met à jour les state.md concernés
3. NOTIFICATION → "✅ Relance envoyée à Sopra. ⚠️ Facture avril non envoyée (anomalie)."
```

### Flux 3 : Instruction de Lolo

```
1. Lolo ouvre l'app web → "Mets le bureau en vente sur 2ememain, prix 300€"
2. RECEIVER crée un event "instruction de Lolo"
3. LAUNCHER lance Claude avec l'instruction
4. Claude :
   a. Crée un nouveau dossier workspace/2ememain-bureau/
   b. Écrit state.md avec l'objectif et les infos
   c. Commence à créer l'annonce sur 2ememain (browser)
   d. A besoin de photos → checkpoint.md : "J'ai besoin de photos du bureau"
5. NOTIFICATION → "📷 J'ai besoin de photos du bureau → [Répondre]"
6. Lolo envoie les photos via l'app web
7. LAUNCHER relance Claude avec les photos
8. Claude crée l'annonce, preview → checkpoint.md
9. Lolo valide → annonce publiée
```

### Flux 4 : Blocage (captcha/MFA)

```
1. Claude travaille sur le rapport exali (session tmux)
2. Va sur exali.com → page de login → entre les credentials (Bitwarden)
3. Le site demande un code MFA
4. Claude prend un screenshot, écrit checkpoint.md :
   "Bloqué sur exali.com — MFA requis. Voir screenshot."
5. NOTIFICATION → "⚠️ Bloqué sur exali.com (MFA) → [Intervenir]"
6. Lolo ouvre l'app web → voit le screenshot → entre le code MFA
7. Le code est transmis à Claude (comment exactement ? question ouverte)
8. Claude continue son travail
```

---

## Ce qu'on réutilise de V1

| Composant V1 | Réutilisation |
|---|---|
| Skills Claude Code | ✅ Intégralement (/comptable, /navigate, /sms, etc.) |
| MCP servers | ✅ Intégralement (Gmail, Calendar, Notion, etc.) |
| Resource locks (PID-based) | ✅ Mécanisme de lock dans /tmp/ |
| Dedup par hash | ✅ Le concept, peut-être pas le code exact |
| Tmux sessions | ✅ Pour les sessions avec browser/interaction |
| React dashboard | 🔄 Base à réutiliser/adapter pour l'app web |
| Telegram bot | 🔄 Simplifié (notifications uniquement) |
| Event bus | ❌ Remplacé par le receiver simple |
| Queue + priorités | ❌ Plus nécessaire |
| Triage IA custom | ❌ Claude décide lui-même |
| Conversation manager | ❌ Pas un besoin |
| Knowledge base | ❌ Remplacé par les fichiers workspace |
| Style mimicry | ❌ Pas un besoin |

---

## Questions ouvertes restantes

### 1. Comment lancer Claude concrètement ?
Print mode vs tmux vs hybride. Nécessite des tests :
- Est-ce que `claude -p` supporte les skills et le browser ?
- Est-ce que les sessions tmux sont assez stables pour de l'autonomie ?
- Comment gérer l'intervention MFA en mode print ?

### 2. Comment le triage/routing fonctionne ?
Quand un event arrive, comment savoir quel dossier il concerne ?
- Option simple : Claude reçoit l'event + la liste des dossiers, il décide
- Option avec manager : un Claude "triage" rapide qui route
- Pour commencer : peut-être juste donner l'event à Claude et le laisser chercher

### 3. Hard stops : implémentation technique
Comment empêcher TECHNIQUEMENT Claude d'envoyer un paiement sans approbation ?
- Prompt système (fragile)
- Hooks Claude Code (plus fiable)
- Outils modifiés qui refusent (le plus sûr)

### 4. App web : intervention captcha/MFA
Comment permettre à Lolo d'entrer un code MFA depuis l'app web vers
le browser que Claude contrôle ?
- Screenshot + champ de saisie ?
- Stream vidéo du browser ?
- Claude qui attend et poll un fichier ?

### 5. Scope du jour 1
Quels dossiers/workflows pour le lancement ?
→ À discuter quand l'architecture est validée.
