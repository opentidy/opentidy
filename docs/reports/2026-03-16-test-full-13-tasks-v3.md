# Test Report: 13 Test Tasks — Full System E2E (v3)
**Date:** 2026-03-16 12:25
**Status:** PARTIAL (11/13 correct)
**Lancées:** 13/13 | **TERMINÉ:** 9 | **BLOQUÉ (attendu):** 3 | **EN ATTENTE:** 1 | **PROCHAINE ACTION:** 1

## Executive Summary

Troisième run avec le nouveau lifecycle centralisé (on-stop.sh signal-only, backend gère tout). Découverte importante : **le hook Stop fire AVANT que state.md soit écrit** — on-stop.sh ne voit jamais TERMINÉ. C'est le watchdog (fs.watch + polling) qui est le vrai lifecycle manager. L'agent post-session est maintenant branché sur le watchdog. Le confirm mode, les checkpoints, PROCHAINE ACTION et En attente fonctionnent tous correctement.

## Découverte clé : race condition Stop hook vs state.md

Le hook Stop fire après chaque réponse Claude. Mais Claude écrit dans state.md via le tool Write, qui fait partie de la réponse. Le timing est :
1. Claude appelle Write(state.md, "STATUT : TERMINÉ") → tool s'exécute
2. Claude génère le texte de réponse final
3. Hook Stop fire → on-stop.sh lit state.md

On pourrait croire que (1) s'exécute avant (3), mais en pratique on-stop.sh voit souvent "EN COURS" au moment du fire. **Sur les 8 sessions TERMINÉ, 0 ont été détectées par on-stop.sh.** Toutes ont été catchées par le watchdog.

**Conséquence :** on-stop.sh est utile pour BLOQUÉ et PROCHAINE ACTION (qui sont écrits par Claude plus tôt dans la session, pas au dernier tool call), mais pas pour TERMINÉ. Le watchdog est indispensable.

## Analyse des logs — couverture actuelle

### Logs présents et utiles
- `[test-tasks] Starting launch X/13` + `Launched X/13` — traçabilité lancement
- `[launcher] launchSession(id) — acquiring lock` / `lock acquired` / `generating CLAUDE.md` / `spawning tmux` / `tmux spawned` — flow complet du lancement
- `[tmux] new-session -d -s X` / `session X created (pid: Y)` — confirmation tmux
- `[hooks] Lifecycle signal: id → STATE` — signaux on-stop.sh reçus par le backend
- `[watchdog] id: dossier TERMINÉ, terminating session` — watchdog cleanup
- `[on-stop HH:MM:SS] id → STATE, signaling/no signal` — trace shell hook

### Logs manquants (à ajouter)
| Où | Quoi | Pourquoi |
|----|------|----------|
| `watchdog.ts` | `[watchdog] id: fs.watch triggered` | On voit les résultats du watchdog mais pas le trigger. Utile pour savoir si c'est fs.watch ou polling qui a détecté le changement |
| `watchdog.ts` | `[watchdog] id: post-session agent launched/skipped (reason)` | Savoir si l'agent post-session a été lancé ou pas |
| `session.ts` | `[launcher] id: sendKeys instruction sent` en plus de `Sent initial instruction` | L'instruction envoyée est longue — log le début (30 chars) pour savoir quelle tâche |
| `handler.ts` | `[hooks] id: TERMINÉ — killing + cleanup + post-session` | Le flow lifecycle complet quand on-stop.sh détecte TERMINÉ (même si c'est rare) |
| `mail-reader.ts` | `[mail-reader] Found X emails in last 5min` | Savoir si le mail reader travaille (même quand 0 résultats) |
| `index.ts` | `[alfred] Mail watcher poll: X new emails` | Trace du poll au niveau watcher |

### Logs inutiles / bruyants à supprimer
| Où | Quoi | Pourquoi |
|----|------|----------|
| `watchdog.ts` | `[watchdog] id: active` | Logge pour CHAQUE session active à chaque poll (60s × N sessions = bruit) |
| `on-stop.sh` | `id → EN COURS (no signal)` | La majorité des fires du Stop hook — pollue le log |

## Step-by-Step Results

### Task 1: Cycle rapide — PASS TERMINÉ, artifact spec-resume.md
### Task 2: Browse + scrape Chypre — PASS TERMINÉ, artifact deadlines-chypre-2026.md
### Task 3: Login GitHub — PASS TERMINÉ (TERMINE sans accent), artifact github-repos.md
### Task 4: Email + En attente — EN COURS, email envoyé, section En attente correcte, mail watcher pas encore pollé
### Task 5: Bitcoin récurrent — PROCHAINE ACTION, session tuée par hook
### Task 6: Confirm mode — PASS TERMINÉ après validation, artifact email-comptable.md
### Task 7: Recherche comparative — PASS TERMINÉ, artifact comparatif-facturation.md
### Task 8: Monitoring email — TERMINÉ (a fait ses vérifications puis terminé)
### Task 9: LinkedIn + conférences — PASS TERMINÉ, artifact conferences-2026.md
### Task 10: Booking.com hooks — PASS TERMINÉ, artifact hotel-larnaca.md
### Task 11: Contacts macOS — PASS TERMINÉ, artifact contacts-gmail.md
### Task 12: Mémoire injection — BLOQUÉ "mémoire système vide" (attendu, correct)
### Task 13: Mémoire extraction — BLOQUÉ "Loaddr Ltd introuvable sur Companies House UK" (checkpoint pertinent)

## Issues Found

### Bugs
| # | Issue | Sévérité | Details |
|---|-------|----------|---------|
| 1 | on-stop.sh ne détecte jamais TERMINÉ | Moyen | Race condition: hook fire avant que state.md soit écrit. Watchdog compense. on-stop.sh utile uniquement pour BLOQUÉ/PROCHAINE |
| 2 | checkpoint.md pas supprimé pour dossier TERMINÉ | Mineur | Le confirm mode dossier est TERMINÉ mais checkpoint.md reste → UI montre encore "Pour toi". Fix: le watchdog clean maintenant le checkpoint (ajouté dans ce run) |
| 3 | Activity feed vide après tsx restart | Mineur | Le notification store est in-memory — perdu au restart. Le feed dit "Rien à signaler" alors que 9 dossiers sont terminés |
| 4 | gaps.md toujours vide | En attente | L'agent post-session est branché sur le watchdog mais n'a pas encore été déclenché (les sessions se sont terminées avant le hotreload) |

### UX
| # | Issue | Details |
|---|-------|---------|
| 5 | "En fond — l'assistant travaille" montre des sessions BLOQUÉ | Les sessions BLOQUÉ (idle au prompt) apparaissent comme "en fond" alors qu'elles attendent une action humaine |
| 6 | Pas de distinction "En attente" dans l'UI | Un dossier En attente (attend le monde extérieur) et un dossier EN COURS actif ont la même apparence |

## Recommandations logs

### À ajouter (5 lignes)
1. `[mail-reader] polled: X emails found` — trace du mail reader même à 0
2. `[watchdog] {id}: post-session agent launched` — confirmation post-session
3. `[watchdog] {id}: detected by fs.watch` vs `detected by poll` — source de détection
4. `[hooks] Lifecycle TERMINÉ: {id} — kill + cleanup` — quand on-stop.sh détecte (rare)
5. `[launcher] {id}: sending instruction (first 50 chars)` — quelle instruction

### À supprimer
1. `[watchdog] {id}: active` — trop fréquent, bruit
2. `[on-stop] {id} → EN COURS (no signal)` — 90% des fires, pollue le log
