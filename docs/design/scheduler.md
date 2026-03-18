# Scheduler — Planification précise des dossiers

**Date** : 2026-03-17
**Statut** : À implémenter

## Problème

Le checkup horaire est le seul mécanisme de relance automatique. Deux trous :
1. **Pas de précision temporelle** — `PROCHAINE ACTION: 18:29` ne sera vérifié qu'au prochain checkup (±1h)
2. **Pas d'intervalle custom** — impossible de faire tourner un dossier toutes les 30min

## Solution : Scheduler comme composant d'infra

Même catégorie que locks, dedup, sessions : une table SQLite + de la plomberie.

### Table `schedules`

```sql
CREATE TABLE schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('once', 'recurring')),
  run_at      TEXT,              -- ISO datetime pour one-shot
  interval_ms INTEGER,           -- millisecondes pour recurring
  last_run_at TEXT,              -- dernier déclenchement effectif
  instruction TEXT,              -- optionnel : instruction au déclenchement
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Fonctionnement

Event-driven, pas polling. Un seul `setTimeout` pointé sur le prochain event.

```
Session exit → scheduler.syncFromDossier(dossierId) → recomputeNextTimer()
API call     → INSERT INTO schedules → recomputeNextTimer()
Timer fires  → launchSession() → once: DELETE / recurring: UPDATE last_run_at
Startup      → SELECT FROM schedules → fire overdue → timer pour le prochain
```

### API

```
POST   /api/schedule              — créer un schedule
GET    /api/schedules             — lister les schedules actifs
DELETE /api/schedule/:id          — annuler un schedule
GET    /api/schedule/next         — prochain déclenchement prévu
```

### Sources de création

| Source | Comment |
|--------|---------|
| Claude (en session) | `curl POST localhost:5174/api/schedule` via Bash tool |
| L'utilisateur (UI) | Bouton dans le détail dossier |
| Checkup | Filet de sécurité si date détectée |

### Exemples

**One-shot précis** : drop sneakers à 18:29 → `{ type: "once", runAt: "2026-03-17T18:29:00" }`
**Récurrent** : surveille BTC toutes les 30min → `{ type: "recurring", intervalMs: 1800000 }`

### Robustesse

- SQLite = survit aux restarts
- setTimeout = précision milliseconde
- API structurée = pas de regex sur markdown
- Visible dans l'UI = l'utilisateur peut voir/annuler
- Crash recovery = fire les overdue au startup

### Cohérence avec les principes

- **#4** : Claude décide (appelle l'API), backend exécute (setTimeout + launchSession)
- Le checkup garde son rôle (discovery, suggestions, health) — ne fait plus de scheduling
- state.md reste la mémoire de Claude, pas un fichier de config scheduling

### Scope

1. `apps/backend/src/launcher/scheduler.ts` (~120 lignes)
2. 4 routes dans `server.ts`
3. UI détail dossier : schedule actif + bouton "planifier"
4. Doc workspace/CLAUDE.md pour que Claude sache utiliser l'API
5. Cleanup dans `archiveSession`
6. Tests
