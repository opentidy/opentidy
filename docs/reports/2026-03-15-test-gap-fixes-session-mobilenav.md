# Test Report: Gap Fixes — hasActiveSession + MobileNav + Notifications
**Date:** 2026-03-15 03:00
**Status:** PASSED
**Steps completed:** 5/5

## Executive Summary
Tested hasActiveSession indicator on dossier cards, mobile bottom navigation fix (Amelio. instead of Plus), and notifications rendering via Playwright. All features work correctly: "Session active" appears in green on dossiers with tmux sessions, mobile nav has correct "Amelio." tab linking to /ameliorations, and the ActivityFeed correctly hides when there are no notifications.

## Step-by-Step Results

### Step 1: Dossiers — Session active indicator
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-10-session-active.png`
- **Notes:** Dossier card shows "Session active" in green text on the right side. hasActiveSession correctly hydrated from launcher.

### Step 2: Home — Active sessions section
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-11-home-sessions.png`
- **Notes:** "EN FOND — L'ASSISTANT TRAVAILLE" section visible with 1 session card. "1 session" green badge in header.

### Step 3: Mobile nav — 5 tabs verification
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-12-mobile-nav.png`
- **Notes:** Bottom nav shows: Home, Dossiers, Nouveau, Terminal, Amelio. — last tab is "Amelio." (not the old broken "Plus").

### Step 4: Amelio. tab navigation
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/test-gap-13-amelio-mobile.png`
- **Notes:** Click on "Amelio." navigates to /ameliorations. Tab highlighted active. Page renders "Ameliorations" with "0 detectees".

### Step 5: Home — Notifications section
- **Status:** PASS
- **Notes:** ActivityFeed not rendered because notifications list is empty — correct behavior (component returns null when empty). No errors in console.

## Issues Found

### Blocking Issues
None.

### Non-Blocking Issues
None.

## UX & Ergonomic Review
- "Session active" indicator is clear and well-positioned
- Mobile nav is clean with proper tab ordering
- Empty notification state is handled gracefully (section hidden, not showing empty state)

## Improvement Suggestions

### Nice-to-have (polish)
| # | Suggestion | Effort |
|---|-----------|--------|
| 1 | Show "Aucune notification" text instead of hiding section entirely | ~10min |
