# Test Report: Gap Fixes — Sweep Status + Historique + MobileNav
**Date:** 2026-03-15 02:50
**Status:** PASSED
**Steps completed:** 6/6

## Executive Summary
Tested the sweep status, historique tab, hasActiveSession indicator, and MobileNav fix via Playwright browser automation. All features work correctly: sweep status shows real "Sweep — en attente" instead of hardcoded text, historique tab shows real journal entries with dates, "Session active" indicator appears on dossiers with tmux sessions, and mobile nav "Amelio." tab correctly navigates to /ameliorations. Only cosmetic issue: missing favicon.

## Step-by-Step Results

### Step 1: Home page — sweep status
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-01-home-sweep.png`
- **Notes:** Header shows "Sweep — en attente" (not the old hardcoded "Sweep 5 min - OK"). 1 active session shown.

### Step 2: Dossiers list — hasActiveSession
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-02-dossiers.png`
- **Notes:** Dossier card shows "Session active" in green text — hasActiveSession hydration works. Terminé tab shows 1 dossier.

### Step 3: Dossier detail page
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-03-detail.png`
- **Notes:** Detail page shows Session active indicator, Objectif, "Ouvrir le terminal" button, and "Valider avant actions externes" checkbox.

### Step 4: Mobile view — tabs
- **Status:** PASS
- **Notes:** At 375px width, 3 tabs visible: "etat", "Fichiers (0)", "historique". Bottom nav shows "Amelio." tab.

### Step 5: Historique tab — journal entries
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-04-historique.png`
- **Notes:** Shows 2 journal entries: "2026-03-15: Email trouvé via git config..." and "2026-03-14: Créé". NOT the old placeholder text.

### Step 6: MobileNav Amelio. tab
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-05-ameliorations.png`
- **Notes:** "Amelio." navigates to /ameliorations (URL confirmed). Page shows "Ameliorations" heading with "0 detectees". Tab is highlighted active.

## Issues Found

### Blocking Issues
None.

### Non-Blocking Issues

| # | Issue | Category | Page URL | Step | Expected vs Actual | Error details | Source file (if found) | Repro steps |
|---|-------|----------|----------|------|--------------------|---------------|----------------------|-------------|
| 1 | Missing favicon | Cosmetic | all pages | all | Expected favicon, got 404 | `GET /favicon.ico => 404` | `apps/web/public/` (no favicon.ico) | Load any page |

## UX & Ergonomic Review
- Sweep status "en attente" is clear but could show interval (e.g., "Sweep toutes les 60min — en attente")
- Journal entries in historique are displayed newest-first which is correct
- Mobile nav truncates "Amelio." but it's readable

## Improvement Suggestions

### Nice-to-have (polish)
| # | Suggestion | Effort |
|---|-----------|--------|
| 1 | Add a favicon.ico to public/ | ~5min |
| 2 | Show sweep interval in status text | ~10min |
