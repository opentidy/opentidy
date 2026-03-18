# Test Report: Créer un dossier LinkedIn + checkup
**Date:** 2026-03-16 22:38
**Status:** PASSED (avec issues UX)
**Steps completed:** 5/5

## Executive Summary
Test du flow complet : création d'un dossier Alfred (récupérer annonces LinkedIn toutes les 20 min), vérification de la session autonome, lancement du checkup via l'UI. Tout fonctionne correctement après fix du bug `--allowedTools`. Un bug critique de visibilité identifié : aucun historique terminal/output visible sur la page détail du dossier après session terminée.

## Step-by-Step Results

### Step 1: Home vierge
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test3-step-01-home-clean.png`
- **Notes:** "Tout roule", 0 sessions, rien à signaler.

### Step 2: Créer le dossier LinkedIn
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test3-step-01-dossiers-list.png`
- **Notes:** Formulaire → saisie instruction → "Lancer" → POST /api/dossier 200 OK → redirection /dossiers → 1 dossier "En cours" avec "Session active".

### Step 3: Vérifier le détail du dossier
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test3-step-03-dossier-detail.png`
- **Notes:** Objectif complet, journal "Créé", sidebar "Session Active - < 1 min", boutons "Ouvrir le terminal" et "Stopper la session".

### Step 4: Lancer le checkup depuis l'UI
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test3-step-04-checkup-done.png`
- **Notes:** "Lancer checkup" → "Checkup en cours..." (bouton disabled) → attente ~2min → "Checkup 22:40 — OK · Prochain à 23:25" → "Checkup terminé — 1 session lancée". Le checkup a correctement détecté et relancé le dossier actif.

### Step 5: Vérifier l'historique terminal après session terminée
- **Status:** FAIL
- **Screenshot:** `.playwright-mcp/test3-step-05-dossier-no-terminal.png`
- **Notes:** La session a terminé son scan LinkedIn (journal mis à jour, PROCHAINE ACTION définie). Mais aucun historique de session/terminal visible sur la page détail. Le sidebar "Session" a complètement disparu. L'utilisateur ne peut pas voir ce que Claude a fait.

## Issues Found

### Blocking Issues
Aucune.

### Non-Blocking Issues

| # | Issue | Category | Page URL | Step | Expected vs Actual | Error details | Source file (if found) | Repro steps |
|---|-------|----------|----------|------|--------------------|---------------|----------------------|-------------|
| 1 | Pas d'historique terminal sur la page détail après session terminée | UX/Feature gap | /dossier/:id | Step 5 | **Expected:** voir l'historique de ce que Claude a fait (outils utilisés, résultats, output). **Actual:** seul le journal (state.md) est visible. Le sidebar Session disparaît complètement. | Pas d'erreur — le composant n'existe simplement pas dans DossierDetail. Les données existent côté backend (JSONL 345KB + API `GET /api/claude-processes/:id/output`). | `apps/web/src/pages/DossierDetail.tsx` — sidebar Session (lignes ~170-180) ne s'affiche que quand `hasActiveSession=true`. Aucun fallback pour les sessions terminées. | Créer un dossier → attendre que la session termine → ouvrir le détail du dossier → aucun historique visible |
| 2 | Le bouton Reset ne supprime pas les dossiers du workspace | Bug | / | — | **Expected:** Reset = état propre (sessions killées + dossiers supprimés). **Actual:** Les sessions sont stoppées mais les dossiers workspace restent (state.md, répertoires). | — | Non investigué — probablement `POST /api/reset` ne fait qu'un cleanup in-memory sans toucher les fichiers workspace. | Créer un dossier → Reset → les dossiers persistent dans la liste |

### User-Reported Issues

| # | Issue | Category | Page URL | Step | Expected vs Actual | Error details | Source file (if found) | Repro steps |
|---|-------|----------|----------|------|--------------------|---------------|----------------------|-------------|
| 1 | "je vois la tâche mais aucun historique de terminal" | UX | /dossier/:id | Step 5 | L'utilisateur s'attend à voir ce que Claude a fait. Ne voit que le journal. | — | Même que Non-Blocking #1 | — |

## Bug Fix Applied During Test

**Bug `--allowedTools` variadic** : Le flag CLI `--allowedTools <tools...>` est variadic et consomme tous les arguments restants, y compris le prompt. Fix : ajout de `--` (séparateur POSIX) avant le prompt.

**Fichiers modifiés :**
- `apps/backend/src/launcher/checkup.ts:70` — `'--'` ajouté avant prompt
- `apps/backend/src/memory/agents.ts:178` — idem

## UX & Ergonomic Review

- **Historique terminal manquant** — problème principal. L'output JSONL est capturé (345KB) et l'API existe (`GET /api/claude-processes/:id/output`), mais la page détail ne l'affiche pas. L'utilisateur doit aller sur `/terminal` séparément pour voir ce que Claude a fait.
- **Sidebar Session disparaît** — quand la session termine, tout le panel "Session" disparaît. Devrait au minimum montrer un lien vers l'historique de la dernière session.
- **Titre tronqué sans tooltip** — le titre long se coupe à "...qui co" partout (header, liste, détail).
- **Warning SSE console à chaque navigation** — comportement normal (EventSource se ferme au changement de route) mais pourrait être silencieux.

## Improvement Suggestions

### Critical (blocks user understanding)
| # | Suggestion | Effort |
|---|-----------|--------|
| 1 | Afficher l'historique de session sur la page détail du dossier (réutiliser le composant `ProcessOutput` de Terminal.tsx, lier via `ClaudeProcess.dossierId`) | ~2-3h |

### Important (degrades experience)
| # | Suggestion | Effort |
|---|-----------|--------|
| 2 | Quand session terminée, afficher dans le sidebar : dernière session (durée, exit code) + lien "Voir l'historique" | ~1h |
| 3 | Reset devrait nettoyer les dossiers workspace (ou demander confirmation) | ~1h |

### Nice-to-have (polish)
| # | Suggestion | Effort |
|---|-----------|--------|
| 4 | Tooltip sur les titres tronqués | ~30min |
| 5 | Supprimer le warning console SSE lors des navigations | ~15min |
