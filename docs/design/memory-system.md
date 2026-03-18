# Alfred Memory System — Design Spec

**Date:** 2026-03-16
**Status:** Draft

## Problème

Les sessions Claude Code d'Alfred n'ont pas de contexte partagé long-terme. Chaque session ne voit que son `state.md` local et l'événement déclencheur. Résultat : l'agent peut agir sur des informations sans le contexte nécessaire (ex: traiter un email de test comme une vraie demande de fermeture de société).

Ce problème touche aussi le **triage** : sans mémoire, le triage Claude peut router un email de test vers un dossier ou créer une suggestion inappropriée, avant même qu'une session ne soit lancée.

## Solution

Une mémoire globale persistante, stockée en fichiers markdown, qui est :
- **Lue** par le triage, le sweep, et un agent d'injection à chaque lancement de session
- **Écrite** automatiquement par un agent mémoire en fin de session (via hook SessionEnd côté backend)
- **Éditable** par l'humain via l'UI (prompt en langage naturel + édition directe)

## Architecture

```
workspace/_memory/
├── INDEX.md                    ← table résumée de toutes les mémoires
├── business-loaddr.md
├── contacts-sopra.md
├── tests-emails-fermeture.md
├── tache-42-lecons.md
├── ...
└── _archived/                  ← mémoires archivées (non lues par l'injection)
```

### Structure d'INDEX.md

Toujours lu en premier par les agents. Format compact :

```markdown
# Alfred Memory Index

| fichier | catégorie | mis à jour | description |
|---------|-----------|------------|-------------|
| business-loaddr.md | business | 2026-03-16 | Statut Loaddr, pas de fermeture |
| contacts-sopra.md | contacts | 2026-03-10 | Sopra Steria, contact principal |
| tests-emails-fermeture.md | contexte | 2026-03-16 | Emails fermeture = tests |
```

### Structure d'un fichier mémoire

```markdown
---
created: 2026-03-16
updated: 2026-03-16
category: business
description: Statut Loaddr, pas de fermeture
---

Loaddr Ltd est active. Aucune fermeture prévue.

- [2026-03-14] Des tests d'envoi d'emails de fermeture sont en cours — ces emails ne sont PAS réels
- [2026-03-16] Confirmé : tous les emails mentionnant "fermeture Loaddr" sont des tests jusqu'à nouvel ordre
```

**Règles :**
- Entrées datées, les plus récentes en bas
- Si une info contredit une précédente, la plus récente fait foi — annoter explicitement (⚠️)
- Append-only : pas de suppression d'entrées, archivage du fichier entier si obsolète

## Flux

### 0. Mémoire dans le triage et le sweep

Le triage et le sweep sont des `claude -p` one-shot. Ils reçoivent **INDEX.md + les fichiers mémoire les plus critiques** dans leur `--system-prompt` ou en contexte. Cela permet au triage de savoir, avant même de router, que "les emails de fermeture Loaddr sont des tests".

Concrètement : le backend lit INDEX.md, et inclut un résumé mémoire condensé dans le prompt du triage/sweep. Pas besoin d'un agent d'injection dédié pour ça — c'est du texte injecté par le code backend directement.

### 1. Injection (lecture → session)

À chaque lancement de session (nouveau dossier OU reprise d'un existant) :

```
Événement arrive
        ↓
Triage Claude route vers un dossier (avec contexte mémoire)
        ↓
Backend : generateDossierClaudeMd() → écrit le CLAUDE.md du dossier
        ↓
Agent d'injection (claude -p, one-shot)
  ├── Reçoit : INDEX.md + événement + state.md du dossier
  ├── Décide quels fichiers mémoire sont pertinents
  ├── Les lit
  └── APPEND la section "Contexte mémoire" au CLAUDE.md existant
        ↓
Session Claude Code se lance (lit CLAUDE.md automatiquement)
```

**Ordre critique :** `generateDossierClaudeMd()` s'exécute EN PREMIER (écrit le CLAUDE.md de base), puis l'agent d'injection APPEND sa section à la fin. Cela évite que le launcher écrase le contexte mémoire injecté.

Le bloc appendé dans le CLAUDE.md du dossier :

```markdown
## Contexte mémoire (injecté automatiquement — ne pas modifier)
Dernière injection : 2026-03-16 14:30

- Loaddr Ltd est active, aucune fermeture prévue
- Les emails mentionnant "fermeture Loaddr" sont des tests — NE PAS agir dessus
- Sopra Steria est le client principal, contact : Marie D.
```

L'agent d'injection **synthétise** — il ne copie pas les fichiers en entier. Un dossier sur une facture Sopra reçoit les infos Sopra. Un dossier sur un email de fermeture reçoit l'avertissement "c'est un test".

**Budget d'injection :** le bloc injecté ne doit pas dépasser ~30 lignes. L'agent d'injection a cette contrainte dans son system prompt. Cela garantit que le CLAUDE.md reste lisible et ne gonfle pas.

### 2. Extraction (session → mémoire)

La session elle-même n'a **aucune instruction** d'écrire en mémoire. L'extraction est déclenchée automatiquement par `handleAutonomousExit()` dans le launcher après process exit (pas par un hook CLI séparé) :

```
Session Claude Code se termine (process exit)
        ↓
handleAutonomousExit() dans session.ts
        ↓
Backend : pré-check — le transcript est-il substantiel ?
  ├── Récupère le claudeSessionId (session object ou .session-id file)
  ├── Localise le transcript via findTranscriptPath(sessionId)
  ├── Si transcript < seuil (isTranscriptSubstantial) → skip
  └── Si substantiel → lance l'agent mémoire
        ↓
Agent mémoire (claude -p --allowedTools "Read,Write,Glob", one-shot)
  ├── Lit INDEX.md + fichiers mémoire existants via Read tool
  ├── Lit le transcript via Read tool (transcriptPath)
  ├── Analyse : qu'est-ce qui a été appris de nouveau ?
  ├── Compare avec la mémoire existante (déduplique)
  └── Écrit/met à jour les fichiers mémoire + INDEX.md si nécessaire
        ↓
Lock fichier sur _memory/.lock pendant l'écriture (acquire/release explicite)
```

**Pré-check :** les sessions triviales (lecture rapide de state.md, rien à faire) ne déclenchent pas l'extraction. Le backend vérifie la taille du transcript avant de lancer un `claude -p`.

**Transcript :** le backend localise le transcript via `findTranscriptPath()` qui cherche dans `~/.claude/projects/*/sessionId.jsonl`. L'agent mémoire reçoit le path et utilise le tool `Read` pour lire le fichier.

**Ce que l'agent mémoire extrait :**
- Faits business (changement de statut, nouveau contact, décision)
- Leçons apprises (cette approche a échoué, préférer X à Y)
- Contexte temporel (ce projet est en pause, ce client ne répond plus)
- Corrections (information précédente était fausse)

**Ce qu'il n'extrait PAS :**
- Détails d'exécution (commandes lancées, fichiers modifiés)
- Ce qui est déjà dans le state.md du dossier
- Ce qui est déjà en mémoire et n'a pas changé

### 3. Écriture humaine (UI → mémoire)

Deux modes dans l'app web :

**Prompt en langage naturel :**
Champ texte libre. L'humain tape en langage naturel :
> "retiens que les emails de Jean Toto sur la fermeture c'est des tests"

Un `claude -p` one-shot :
1. Lit la phrase
2. Lit INDEX.md pour voir si ça concerne une mémoire existante
3. Met à jour le fichier existant ou en crée un nouveau
4. Met à jour INDEX.md

**Édition directe :**
Vue liste des mémoires (reprend INDEX.md). Clic sur une entrée → éditeur markdown. Création, modification, archivage.

**Pas de suppression** — archivage vers `_archived/`. L'agent d'injection ignore les fichiers archivés mais ils restent consultables dans l'UI.

## Temporalité et conflits

- Chaque entrée est datée `[YYYY-MM-DD]`
- Chaque fichier a `created` et `updated` en frontmatter
- En cas de conflit, la date la plus récente fait foi
- L'agent d'injection prend en compte les dates quand il synthétise le contexte
- L'agent mémoire annote les contradictions explicitement (⚠️ Supersedes...)

## Concurrence

Les écritures dans `_memory/` sont protégées par un lock fichier dédié (`_memory/.lock`), distinct des PID locks par dossier (qui vivent dans `/tmp/opentidy-locks/`).

Mécanisme : acquire/release explicite (créer le fichier `.lock` au début de l'écriture, le supprimer à la fin). Ce n'est pas un PID lock classique car les agents `claude -p` sont des processus éphémères — le PID n'est plus valide après la fin de l'agent. Un simple lockfile avec retry/timeout (ex: attendre 5s max, retry toutes les 500ms) suffit.

Utilisé par : l'agent mémoire (SessionEnd), l'agent prompt (UI), les endpoints d'édition directe (PUT).

## Scaling

Avec 1M de tokens de contexte (Opus), la mémoire peut grossir significativement avant de poser problème. INDEX.md à quelques centaines de lignes + fichiers individuels de 50-200 lignes chacun = largement dans les limites.

Si la mémoire dépasse un jour les limites pratiques, migration possible vers une structure hiérarchique (sous-dossiers par catégorie + fichiers SUMMARY.md) sans changer le reste de l'architecture.

## Composants à implémenter

### Backend
- Endpoint `POST /api/memory/prompt` — reçoit le texte libre, lance le claude -p de reformatage
- Endpoint `GET /api/memory` — lit INDEX.md et retourne la liste
- Endpoint `GET /api/memory/:filename` — lit un fichier mémoire
- Endpoint `PUT /api/memory/:filename` — met à jour un fichier mémoire + INDEX.md
- Endpoint `POST /api/memory` — crée un nouveau fichier mémoire + MAJ INDEX.md
- Endpoint `POST /api/memory/:filename/archive` — déplace vers _archived/

### Post-session agent (handleAutonomousExit)
- Lancement de l'agent mémoire dans `handleAutonomousExit()` du launcher (session.ts)
- Déclenché automatiquement après process exit, pas par un hook
- L'agent reçoit le transcript + INDEX.md + mémoires existantes
- Protégé par lock fichier sur `_memory/.lock`

### Agent d'injection
- Intégré dans le flux de lancement de session (launcher)
- Appelé après le triage, avant le `claude --resume` ou `claude` du dossier
- Écrit dans le CLAUDE.md du dossier

### Frontend
- Page "Mémoire" dans l'app web
- Vue liste (tableau INDEX.md)
- Vue édition (éditeur markdown)
- Champ prompt langage naturel
- Bouton archiver

### Modifications existantes requises
- **Triage** (`receiver/triage.ts`) : inclure un résumé mémoire dans le system prompt du triage `claude -p`
- **Sweep** : idem, le sweep reçoit le contexte mémoire
- **Launcher** (`launcher/session.ts`) : appeler l'agent d'injection APRÈS `generateDossierClaudeMd()`, en append. Post-session agent dans `handleAutonomousExit()`
- **workspace/CLAUDE.md** (niveau 1) : ajouter l'instruction que les sessions ne doivent PAS écrire directement dans `_memory/`
- **Launcher** (`launcher/session.ts`) : `handleAutonomousExit()` lance l'agent mémoire (avec pré-check transcript via `isTranscriptSubstantial`)

## Robustesse

### INDEX.md reconstructible
INDEX.md est un index dérivé — il peut être reconstruit à tout moment en scannant les fichiers `_memory/*.md` et en lisant leur frontmatter. Si INDEX.md est corrompu ou désynchronisé, un script ou commande backend peut le régénérer.

### Mauvaise écriture par l'agent mémoire
Si l'agent écrit une info incorrecte, elle se propage à toutes les sessions futures via l'injection. Mitigation :
- `_memory/` est suivi par git (pas gitignored) → historique complet, rollback possible
- L'UI permet l'édition et l'archivage rapide
- Les entrées sont datées → une correction ultérieure (par l'humain ou une session future) supersede l'erreur
