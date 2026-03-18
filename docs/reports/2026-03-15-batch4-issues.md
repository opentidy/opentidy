# Issues batch 4 — 15 mars 2026

## 1. Titres = slugs (8/8)
generateTitle échoue silencieusement. Tous les titres sont des IDs de dossier.

## 2. Tâches récurrentes : TERMINÉ après 1 itération
Claude met TERMINÉ après 1 check au lieu de garder EN COURS avec une date de prochaine action. Le patrol ne relance pas.

## 3. T3 email attente : pas de relance quand l'utilisateur répond
Le triage webhook ne sait pas associer un email de réponse à un dossier en attente. La session reste BLOQUÉ indéfiniment.

## 4. Pas de .session-id persisté
handleSessionEnd ne reçoit pas le claudeSessionId depuis le payload du hook. Le --resume ne fonctionne pas.

## 5. _gaps/gaps.md toujours vide
Claude n'écrit pas les gaps malgré l'instruction dans CLAUDE.md.

## 6. Notifications en double (T3)
Le hook Stop ET le watchdog envoient des notifications pour le même checkpoint → boucle : watchdog nudge → Claude répond → Stop hook notifie → watchdog re-nudge.

## 7. UI : compteur "Actifs" faux
"Actifs (0)" alors qu'il y a 1 session active. Le filtre ne compte que EN COURS sans session.
