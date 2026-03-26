# Scheduler : Agenda de l'agent

**Date** : 2026-03-19
**Statut** : Validé (design)

## Problème

Le checkup horaire est le seul mécanisme de relance automatique. Deux trous :
1. **Pas de précision temporelle**, un dossier qui doit agir à 18:29 attend le prochain checkup (±1h)
2. **Pas d'intervalle custom**, impossible de faire tourner un dossier toutes les 30min

Au-delà du timing, l'utilisateur n'a aucune visibilité sur ce que l'agent prévoit de faire et quand.

## Solution : Système unifié scheduler + MCP + calendrier

### Principes de design

1. **Un seul système**. le scheduler remplace le rôle timing du checkup. Le checkup lui-même devient un schedule récurrent dans la table. Pas deux systèmes à maintenir.
2. **Le scheduler est bête**. c'est un timer qui appelle des fonctions existantes (`launcher.launchSession()`, `checkup.runCheckup()`). Zéro intelligence, zéro business logic.
3. **MCP pour les actions**. Claude communique avec le backend via des MCP tools (structurés, validés, feedback immédiat) au lieu d'écrire dans des fichiers.
4. **Calendrier pour la visibilité**. l'utilisateur voit l'agenda complet de l'agent dans un vrai calendrier (FullCalendar).

---

## 1. Data model

Table `schedules` dans le SQLite existant (`workspace/_data/opentidy.db`) :

```sql
CREATE TABLE schedules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_id  TEXT,                                    -- NULL pour les tâches système (checkup)
  type        TEXT NOT NULL CHECK(type IN ('once', 'recurring')),
  run_at      TEXT,                                    -- ISO 8601 UTC pour one-shot
  interval_ms INTEGER,                                 -- millisecondes pour recurring
  last_run_at TEXT,                                    -- dernier déclenchement effectif
  instruction TEXT,                                    -- instruction pour l'agent, ou 'checkup' pour le sweep
  label       TEXT NOT NULL,                           -- libellé humain (affiché dans le calendrier)
  created_by  TEXT NOT NULL DEFAULT 'system',          -- 'system' | 'agent' | 'user'
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_schedules_dossier ON schedules(dossier_id);
```

Table créée dans `shared/database.ts` (pattern existant, toute la DDL centralisée).
Schemas Zod correspondants dans `packages/shared/src/schemas.ts` (SSOT).

**Contraintes :**
- `once` → `run_at` obligatoire, `interval_ms` NULL
- `recurring` → `interval_ms` obligatoire, `run_at` NULL
- `dossier_id` NULL = tâche système

**Exemples :**

| label | type | dossier_id | run_at / interval | created_by |
|-------|------|------------|-------------------|------------|
| Workspace checkup | recurring | NULL | 7 200 000 (2h) | system |
| Relance factures Acme | once | invoices-acme | 2026-03-20T18:29:00Z | agent |
| Surveillance BTC | recurring | btc-monitor | 1 800 000 (30min) | user |
| Follow-up assurance | once | insurance-report | 2026-03-25T09:00:00Z | agent |

---

## 2. Moteur du scheduler

### Polling simple : `setInterval` toutes les 10 secondes

```
setInterval(checkSchedules, 10_000)

checkSchedules():
  1. SELECT * FROM schedules WHERE overdue (run_at <= now pour once, last_run_at + interval_ms <= now pour recurring)
  2. Pour chaque résultat → fire(schedule)

fire(schedule):
  1. Si dossier_id → launcher.launchSession(dossierId, { instruction })
     - Dossier locké ? Skip (ne pas supprimer le once, il sera retried au prochain tick)
     - Lancement réussi ? once → DELETE / recurring → UPDATE last_run_at = now
  2. Si dossier_id NULL → tâche système (ex: checkup.runCheckup())
     - recurring → UPDATE last_run_at = now
  3. Émettre SSE `schedule:fired`
```

**Pourquoi polling et pas event-driven (setTimeout) :**
- Aucune limite de durée (pas de problème int32 / 24.85 jours)
- Aucun drift (compare à l'horloge système à chaque check)
- Auto-healing (si un check rate, le suivant rattrape 10s plus tard)
- Zéro logique de recompute (pas de clearTimeout / reschedule sur chaque insert/delete)
- Précision ±10s: largement suffisant (principe #1 : speed is not a criterion)
- Coût : un SELECT indexé toutes les 10s → <0.1ms par query

### Startup

```
scheduler.start():
  1. Si aucune entrée "checkup" → seeder le checkup récurrent (2h par défaut)
  2. Démarrer le setInterval(checkSchedules, 10_000)
  3. Les overdue sont automatiquement rattrapés au premier tick
```

---

## 3. MCP OpenTidy : embarqué dans le backend Hono

Le MCP server vit sur une route `/mcp` du backend existant. Même process, même port (5175), accès direct à toutes les deps.

**Stack :** `@modelcontextprotocol/sdk` + `@hono/mcp` (Streamable HTTP transport)

### Tools V1

| Tool | Description | Remplace |
|------|-------------|----------|
| `schedule_create` | Créer un schedule (once ou recurring) | `NEXT ACTION` dans state.md |
| `schedule_list` | Lister les schedules (param optionnel `dossier_id`, déduit du cwd si absent) | (none) |
| `schedule_delete` | Supprimer un schedule | (none) |
| `suggestion_create` | Proposer un nouveau dossier | Écriture dans `_suggestions/*.md` |
| `gap_report` | Signaler une limitation | Écriture dans `_gaps/gaps.md` |

Chaque tool a un schema Zod qui valide les inputs. Claude reçoit un retour immédiat (succès + détails, ou erreur + raison).

### Intégration dans le système MCP curated

Le MCP OpenTidy est un **curated MCP** (comme Gmail, Camoufox, WhatsApp), mais avec transport HTTP au lieu de stdio puisqu'il est embarqué dans le backend.

**`config.mcp.curated.opentidy`** :
- `enabled: true` par défaut (c'est le MCP natif du projet)
- `configured: true` (aucun setup nécessaire: il tourne avec le backend)

**`generateClaudeSettings()`** dans `shared/agent-config.ts`, quand opentidy est enabled, ajoute :
```json
{
  "mcpServers": {
    "opentidy": {
      "type": "http",
      "url": "http://localhost:5175/mcp"
    }
  },
  "permissions": {
    "allow": ["mcp__opentidy__*"]
  }
}
```

**Différence avec les autres curated** : pas de module setup interactif (pas de OAuth, pas de QR code). Le MCP est disponible dès que le backend tourne. Visible et togglable dans la page Settings du frontend comme les autres curated MCPs.

Les guardrails (PreToolUse hooks) peuvent intercepter ces appels via un matcher `mcp__opentidy__` dans `guardrails.json`.

**Auth :** pas de bearer token sur `/mcp`. l'agent tourne en local sur la même machine. L'endpoint `/mcp` n'est pas exposé via le tunnel Cloudflare (seul `/api/*` l'est).

### Sources de création des schedules

| Source | Comment |
|--------|---------|
| Claude (en session) | MCP tool `schedule_create` |
| L'utilisateur (UI) | Formulaire dans le calendrier |
| Le système (boot) | Seed du checkup récurrent |

---

## 4. API REST (pour le frontend)

```
POST   /api/schedules          : créer un schedule
GET    /api/schedules          : lister tous les schedules (avec next_run calculé)
PATCH  /api/schedules/:id      : modifier (label, run_at, interval_ms, instruction). Schedules system non modifiables.
DELETE /api/schedules/:id      : supprimer (schedules system non supprimables)
```

Validation Zod dans `packages/shared`, schémas réutilisés frontend/backend/MCP.

### SSE events

| Event | Quand |
|-------|-------|
| `schedule:created` | Nouveau schedule créé (MCP, API, ou boot) |
| `schedule:fired` | Un schedule a été exécuté |
| `schedule:deleted` | Un schedule a été supprimé |

Types ajoutés dans `packages/shared/src/types.ts` (`SSEEventType` union).

---

## 5. Frontend : Calendrier FullCalendar

### Page `/schedule`

Vue calendrier montrant tout ce que l'agent prévoit de faire.

- **Vue par défaut : semaine**: la plus utile au quotidien
- **Vues disponibles** : semaine, mois, jour
- **Code couleur** : par dossier (même couleur que la card dossier), gris pour les tâches système
- **Interactions** : clic sur un créneau → créer, clic sur un événement → détail/modifier/supprimer, drag & drop pour déplacer

### Navigation

"Schedule" ajouté dans la nav (desktop icon rail + mobile tab bar).

### Événements récurrents

FullCalendar ne rend pas nativement les récurrents depuis un `interval_ms`. Le backend calcule les occurrences pour la plage visible (query param `start`/`end` sur `GET /api/schedules`) et retourne des événements synthétiques.

### Stack

```
@fullcalendar/react
@fullcalendar/core
@fullcalendar/timegrid       (vue semaine/jour)
@fullcalendar/daygrid        (vue mois)
@fullcalendar/interaction    (drag & drop, clic)
```

---

## 6. Intégration avec le code existant

### `periodic-tasks.ts`

On retire le `setInterval` du checkup (c'est maintenant un schedule récurrent). Il reste :
- Crash recovery (boot only)
- Session health check (30s, PID alive ?)
- Daily cleanup (dedup hashes, old processes)
- Workspace watcher (fs.watch → SSE)
- **`scheduler.start()`** (nouveau)

### `index.ts`

```typescript
const scheduler = createScheduler({ db, launcher, checkup, locks, sse });
```

### `sweep.ts`

- **Retire** : le guard `NEXT ACTION` (lignes 119-126 actuelles), le scheduler via MCP gère le timing
- **Retire** : le `sendMessage()` dans les sessions actives, fragile, imprévisible
- **Retire** : la logique `getStatus()` en mémoire, le statut se lit depuis la table `schedules`
- **Garde** : l'analyse des dossiers stuck sans schedule, la création de suggestions, la détection de gaps
- Le checkup peut encore déclencher des lancements immédiats pour les dossiers qu'il trouve en difficulté

### `workspace/INSTRUCTIONS.md`

Mise à jour pour :
- Documenter les MCP tools disponibles (`schedule_create`, `suggestion_create`, `gap_report`)
- Indiquer aux agents de ne plus écrire `NEXT ACTION` dans state.md (utiliser `schedule_create` à la place)

### Dossier archivé/supprimé

Cascade delete des schedules associés.

---

## 7. Edge cases & résilience

| Cas | Comportement |
|-----|-------------|
| Backend restart | Le polling reprend, fire les overdue au premier tick |
| Dossier supprimé | Cascade delete des schedules |
| Fire mais dossier locké | Skip. Recurring : prochain cycle rattrape. Once : reste en DB, retried au prochain tick |
| Claude n'appelle pas le MCP tool | Safety net : le checkup (schedule récurrent) tourne toutes les 2h et détecte les dossiers qui auraient dû agir |
| Schedules orphelins | Le daily cleanup vérifie que chaque dossier_id existe dans le workspace |
| Plusieurs schedules même dossier | Autorisé. Les locks empêchent les lancements simultanés |

---

## 8. Structure fichiers (VSA)

```
apps/backend/src/features/scheduler/
  scheduler.ts           : createScheduler(), moteur (polling, fire, dispatch)
  routes.ts              : 4 routes Hono (CRUD)
  scheduler.test.ts      : tests

apps/backend/src/features/mcp/
  server.ts              : createMcpServer(), enregistre les tools
  server.test.ts         : tests
  tools/
    schedule.ts          : schedule_create, schedule_list, schedule_delete
    schedule.test.ts     : tests
    suggestion.ts        : suggestion_create
    suggestion.test.ts   : tests
    gap.ts               : gap_report
    gap.test.ts          : tests

apps/web/src/features/schedule/
  SchedulePage.tsx        : page avec FullCalendar
  ScheduleEventModal.tsx  : modal créer/éditer/supprimer
```

---

## 9. Décisions prises et alternatives rejetées

| Décision | Alternative rejetée | Pourquoi |
|----------|-------------------|----------|
| Système unifié (checkup = schedule) | Scheduler à côté du checkup | Deux systèmes → double maintenance, risque de conflit |
| Polling 10s | setTimeout event-driven | Plus simple, zéro edge case (int32, drift, recompute) |
| MCP tools pour actions agent | NEXT ACTION dans state.md | Structuré, validé, feedback immédiat vs parsing fragile |
| MCP tools pour actions agent | curl REST depuis Claude | Claude peut oublier le curl, MCP est un réflexe natif |
| FullCalendar | Schedule-X | Drag & drop payant (€299/an) chez Schedule-X |
| FullCalendar | react-big-calendar | 9 mois sans release, 15 deps, SASS vs Tailwind |
| MCP embarqué dans Hono | MCP process séparé | Même port, même process, accès direct aux deps |
