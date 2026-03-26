# Homebrew Distribution Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `brew install opentidy/opentidy/opentidy && brew services start opentidy` the only distribution method, eliminating git clone, manual builds, custom wrappers, and LaunchAgent templates.

**Architecture:** Fix the release workflow to produce a correct tarball, update the Homebrew formula, simplify install.sh to a brew one-liner, and strip all git-based update logic from the CLI.

**Tech Stack:** GitHub Actions, Homebrew formula (Ruby DSL), pnpm deploy, shell

---

### Task 1: Fix release workflow packaging

### Task 2: Simplify install.sh to brew one-liner

### Task 3: Simplify opentidy update/stop/restart to brew only

### Task 4: Clean up files that become unnecessary

### Task 5: Trigger a new release to validate the full pipeline
# just a trigger
