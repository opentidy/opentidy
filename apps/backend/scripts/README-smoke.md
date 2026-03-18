# Smoke Tests — /test Commands

Tests manuels E2E-FULL-01 à E2E-FULL-13. Chaque test est une commande `/test` à lancer dans Claude Code avec le backend et le frontend démarrés.

## Prerequisites

```bash
./scripts/smoke-setup.sh   # Create fixture workspace
./scripts/smoke-start.sh   # Start backend (port 3099) + frontend (port 5173)
```

## Tests

### E2E-FULL-01 — Email → dossier existant → action → audit

```
/test Envoie un webhook Gmail POST /api/webhook/gmail avec un email de billing@soprasteria.com
(sujet: "Timesheet juin"). Vérifie que :
1. Le backend accepte le webhook (200)
2. Le fichier workspace/factures-sopra/state.md est modifié (nouvelle entrée)
3. Une session tmux "factures-sopra" existe (tmux list-sessions)
4. Le fichier workspace/_audit/actions.log contient une entrée récente
5. L'app web sur / affiche une session active pour "factures-sopra"
```

### E2E-FULL-02 — Email nouveau → suggestion → approbation → travail → terminé

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

### E2E-FULL-03 — Instruction the user → dossier → checkpoint

```
/test Dans l'app web, va sur /nouveau. Tape l'instruction "Rapport exali annuel 2025"
et clique "Lancer". Vérifie que :
1. Un dossier workspace/rapport-exali*/ est créé avec un state.md
2. L'app redirige vers la page du dossier /dossier/<id>
3. Le state.md contient l'objectif "Rapport exali"
4. Une session tmux existe pour ce dossier (tmux list-sessions)
5. Un lock existe dans /tmp/assistant-locks/
```

### E2E-FULL-04 — Sweep → détection deadline → travail autonome

```
/test Vérifie le workspace : le dossier workspace/exali-rapport/ a un state.md qui
mentionne une deadline dans 3 jours. Déclenche un sweep via POST /api/sweep.
Vérifie que :
1. Une session tmux est lancée pour exali-rapport
2. Le state.md est mis à jour après le traitement
3. L'app web sur / montre une session active pour exali-rapport dans "En fond"
```

### E2E-FULL-05 — Sweep → rien à faire → silence

```
/test Vérifie que tous les dossiers dans workspace/ ont STATUT: TERMINÉ ou sont à jour.
Déclenche un sweep via POST /api/sweep. Vérifie que :
1. Aucune nouvelle session tmux n'est créée
2. Aucune notification n'est envoyée (vérifier GET /api/notifications/recent → vide)
3. L'app web sur / affiche le mode zen (orbe, "Tout roule")
```

### E2E-FULL-06 — Hook DENY → Claude s'adapte

```
/test Vérifie qu'un dossier avec une session active existe. Dans le workspace de ce
dossier, vérifie que si Claude tente une action bloquée par le hook (ex: gmail.send
vers un destinataire inconnu), le hook retourne DENY. Vérifie que :
1. Le fichier workspace/_audit/actions.log contient une entrée DENY
2. Un checkpoint.md est créé dans le dossier (Claude demande l'aide de the user)
3. L'app web affiche le checkpoint dans la section "Pour toi"
4. Le bouton "Ouvrir le terminal" est présent
```

### E2E-FULL-07 — Timeout idle → resume → continuation

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

### E2E-FULL-08 — 3 sessions parallèles sans interférence

```
/test Crée 3 dossiers via l'app web /nouveau : "Test A", "Test B", "Test C".
Vérifie que :
1. 3 dossiers distincts existent dans workspace/
2. 3 sessions tmux distinctes tournent (tmux list-sessions | grep test)
3. 3 locks PID distincts existent dans /tmp/assistant-locks/
4. L'app web sur / affiche 3 sessions actives dans "En fond"
5. Chaque dossier a son propre state.md indépendant
```

### E2E-FULL-09 — Claude découvre un gap en travaillant

```
/test Vérifie qu'un dossier a une session active. Après le travail de Claude,
vérifie que :
1. workspace/_gaps/gaps.md contient une nouvelle entrée (si Claude a rencontré une limite)
2. Un checkpoint.md existe dans le dossier (intervention manuelle)
3. L'app web /ameliorations affiche la nouvelle entrée dans gaps
4. L'app web / affiche le checkpoint dans "Pour toi"
5. Les deux sont indépendants (résoudre le checkpoint ne résout pas le gap)
```

### E2E-FULL-10 — Claude ne crée jamais de dossier seul

```
/test Envoie 5 webhooks Gmail différents avec des sujets variés (facture, impôts,
assurance, rendez-vous, demande client) vers POST /api/webhook/gmail.
Aucun dossier existant ne matche ces emails. Après traitement, vérifie que :
1. AUCUN nouveau dossier n'a été créé dans workspace/ (ls workspace/ sans _*)
2. Des suggestions existent dans workspace/_suggestions/ (au moins 3)
3. L'app web / affiche les suggestions, pas des dossiers actifs
4. Chaque suggestion a un fichier .md avec URGENCE, SOURCE, Résumé
```

### E2E-FULL-11 — Échange de fichiers the user ↔ Claude

```
/test Ouvre un dossier qui a un checkpoint demandant des photos.
Dans l'app web /dossier/<id> :
1. Upload 2 images via le formulaire d'upload
2. Vérifie que les fichiers apparaissent dans workspace/<dossier>/artifacts/
3. Vérifie que les fichiers sont listés dans la sidebar de la page dossier
4. Déclenche un resume de la session
5. Vérifie que le state.md mentionne les fichiers reçus après traitement
```

### E2E-FULL-12 — Premier lancement — workspace vide

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

### E2E-FULL-13 — Backend restart avec sessions en cours

```
/test Vérifie que des sessions tmux sont actives (tmux list-sessions).
Note les sessions et locks actuels.
Redémarre le backend (kill + restart ou POST /api/restart).
Après redémarrage, vérifie que :
1. Les sessions tmux sont toujours actives (indépendantes du backend)
2. Les locks dans /tmp/assistant-locks/ sont cohérents avec les sessions tmux
3. L'app web / affiche les sessions actives correctement
4. Aucun lock orphelin (PID mort) ne persiste
```

## Cleanup

```bash
./scripts/smoke-cleanup.sh   # Kill processes + reset fixtures
```

## Notes

- Le backend tourne sur le port **3099** (pas 3001) pour éviter les conflits
- Le frontend tourne sur le port **5173** (Vite standard)
- Le sweep automatique est désactivé (`SWEEP_INTERVAL_MS=999999999`)
- Les fixtures sont dans `apps/backend/fixtures/smoke-workspace/`
- `smoke-cleanup.sh` recrée les fixtures à l'état initial
