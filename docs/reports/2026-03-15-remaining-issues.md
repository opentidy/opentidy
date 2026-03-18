# Issues restantes — 15 mars 2026 (batch 3)

## Issues à fixer

### 1. Titres = slugs illisibles
Les titres affichés sont des slugs techniques. `generateTitle` ne produit pas de résultats visibles.

### 2. Tâches récurrentes : Claude marque TERMINÉ après 1 itération
T4 (Bitcoin 3x) et T7 (surveillance 2h) marquent TERMINÉ après 1 check. Claude ne planifie pas les itérations suivantes via le patrol.

### 3. /exit échoue : "exit is not a prompt-based skill"
Le skill /exit n'est pas toujours disponible dans les sessions avec --plugin-dir.

### 4. Checkpoints obsolètes restent après completion
T6 a un checkpoint obsolète ("rapport non généré") alors que le rapport est fait et le statut TERMINÉ.

### 5. Session tmux orpheline après /exit
T3 : Claude fait /exit mais la fenêtre tmux reste ouverte.

### 6. Notifications en double
Le watchdog re-notifie les checkpoints à chaque poll (60s).

### 7. Confirm mode : ne lance pas la session
Le code empêche le lancement (`if (!body.confirm)`). La spec dit que confirm = mode de travail, pas bloqueur. La session doit se lancer, Claude checkpointe avant les actions.

## Décision architecturale : /exit n'est plus nécessaire

Le hook Stop (plugin) fire à chaque fois que Claude arrête de parler. `on-stop.sh` lit state.md et agit :
- TERMINÉ → kill session, notify
- BLOQUÉ/checkpoint → notify
- EN COURS → noop

Claude n'a qu'à mettre state.md à jour. Pas besoin de /exit.
