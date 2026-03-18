# Test Report: Bugfixes — Sidebar terminal button, recover(), bridge wiring
**Date:** 2026-03-15 00:48
**Status:** PASSED
**Steps completed:** 5/5

## Executive Summary
All 3 bugfixes verified working. The sidebar now shows an "Ouvrir le terminal" button when a session is active. The terminal bridge connects to tmux sessions. The recover() function detects sessions without requiring .session-id. One non-blocking cosmetic issue: `script: tcgetattr/ioctl` warning in terminal output.

## Step-by-Step Results

### Step 1: Navigate to /dossiers and click active dossier
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/bugfix-step-01-dossiers.png`
- **Notes:** Dossier card clickable, navigates to detail page

### Step 2: Verify sidebar shows SESSION + "Ouvrir le terminal"
- **Status:** PASS
- **Screenshot:** `.playwright-mcp/bugfix-step-02-sidebar-button.png`
- **Notes:** Sidebar shows "SESSION" heading, "Active - 1 min" with green dot, "Ouvrir le terminal" button present. Fix #1 confirmed.

### Step 3: Click "Ouvrir le terminal" — verify connection
- **Status:** PASS (with cosmetic issue)
- **Screenshot:** `.playwright-mcp/bugfix-step-03-terminal.png`
- **Notes:** Terminal connects to tmux session (no more "Connexion impossible" error). Session tab with green dot, status bar correct. Bridge wiring fix #2 confirmed. Non-blocking: `script: tcgetattr/ioctl: Operation not supported on socket` warning displayed.

### Step 4: Navigate to Home — no console errors
- **Status:** PASS
- **Notes:** Home shows "1 session" badge, "En fond" section with active session. 0 console errors.

### Step 5: Go to /terminal directly
- **Status:** PASS
- **Notes:** Session tab visible with green dot, status bar shows "Active 2 min". recover() fix #3 confirmed — session detected without .session-id.

## Issues Found

### Non-Blocking Issues
| # | Issue | Category | Page URL | Step | Expected vs Actual | Error details | Source file | Repro steps |
|---|-------|----------|----------|------|--------------------|---------------|-------------|-------------|
| 1 | PTY warning in terminal | Cosmetic | /terminal | 3 | Expected clean terminal, got `script: tcgetattr/ioctl` warning | `script` command on macOS shows this when stdin is not a TTY | `apps/backend/src/terminal/bridge.ts:41` | Open any terminal session |

## UX & Ergonomic Review
- "Ouvrir le terminal" button in sidebar is well-placed and clearly labeled
- Navigation flow from dossier detail to terminal works smoothly
- Session status is consistently shown across all pages (Home, Dossier detail, Terminal)

## Improvement Suggestions

### Nice-to-have (polish)
| # | Suggestion | Effort |
|---|-----------|--------|
| 1 | Suppress `script: tcgetattr/ioctl` warning from terminal output | ~30min |
