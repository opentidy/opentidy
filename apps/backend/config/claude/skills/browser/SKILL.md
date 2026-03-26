---
name: browser
description: Use Camoufox anti-detection browser for all web navigation. Never use /navigate (Chrome, reserved for user).
---

For ALL web navigation, use this skill which launches Camoufox, an anti-detection browser.

## Usage

Use the `mcp__camofox__*` tools for browsing. Each session gets an isolated browser context.

## Rules

- NEVER use `/navigate` (Chrome), that's reserved for the user
- If Camoufox fails, fall back to Playwright MCP and document the failure in state.md
- Anti-detection is enabled by default; sites won't flag you as a bot
