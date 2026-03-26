#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd

# opentidy-updater.sh: Spawned by OpenTidy backend as detached process
# Env vars: BOT_TOKEN, CHAT_ID, NEW_VERSION, PREV_VERSION
set -euo pipefail

INSTALL_DIR="${OPENTIDY_DIR:-$HOME/Documents/opentidy}"

notify() {
  if [ -n "${BOT_TOKEN:-}" ] && [ -n "${CHAT_ID:-}" ]; then
    curl -sf "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
      -d "chat_id=$CHAT_ID" \
      -d "text=$1" > /dev/null 2>&1 || true
  fi
}

# Detect install method: Homebrew formula or git clone
if brew list opentidy &>/dev/null 2>&1; then
  MODE="brew"
elif [ -d "$INSTALL_DIR/.git" ]; then
  MODE="git"
else
  echo "[updater] Cannot determine install method, aborting"
  notify "Update v$NEW_VERSION failed: unknown install method"
  exit 1
fi

echo "[updater] Update mode: $MODE"

if [ "$MODE" = "brew" ]; then
  # --- Homebrew update ---
  CACHE_DIR="$HOME/.cache/opentidy/releases"
  mkdir -p "$CACHE_DIR"

  # Cache current formula for rollback
  FORMULA_PATH="$(brew formula opentidy 2>/dev/null || true)"
  if [ -n "$FORMULA_PATH" ] && [ -f "$FORMULA_PATH" ]; then
    cp "$FORMULA_PATH" "$CACHE_DIR/opentidy-$PREV_VERSION.rb"
  fi

  echo "[updater] Upgrading via brew..."
  brew upgrade opentidy 2>&1 || {
    notify "brew upgrade opentidy failed"
    exit 1
  }

  echo "[updater] Restarting service..."
  brew services restart opentidy 2>&1

else
  # --- Git-based update ---
  echo "[updater] Pulling latest from git..."
  cd "$INSTALL_DIR"
  git fetch --quiet origin main
  git reset --hard "origin/main" --quiet

  # Ensure PATH includes Homebrew node@22
  export PATH="$(brew --prefix node@22 2>/dev/null)/bin:$PATH"

  echo "[updater] Rebuilding..."
  pnpm install --force --silent 2>&1 | tail -3
  pnpm build 2>&1 | tail -3

  # Restart: kill current server, LaunchAgent will restart it
  echo "[updater] Restarting..."
  pkill -f "node.*dist/cli.js.*start" 2>/dev/null || true
  sleep 2

  # Start server directly if LaunchAgent doesn't pick up
  NODE_CMD="$(brew --prefix node@22 2>/dev/null)/bin/node"
  if ! curl -sf http://localhost:5175/api/health &>/dev/null; then
    "$NODE_CMD" "$INSTALL_DIR/apps/backend/dist/cli.js" start \
      >> "$HOME/Library/Logs/opentidy-stdout.log" \
      2>> "$HOME/Library/Logs/opentidy-stderr.log" &
    disown
  fi
fi

# --- Health check (retry 3 times, 10s apart) ---
for i in 1 2 3; do
  sleep 10
  if curl -sf http://localhost:5175/api/health > /dev/null 2>&1; then
    notify "OpenTidy v$NEW_VERSION en ligne"
    # Prune old cached releases (keep last 3)
    if [ "$MODE" = "brew" ]; then
      ls -t "$CACHE_DIR"/opentidy-*.rb 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true
    fi
    echo "[updater] Update successful"
    exit 0
  fi
  echo "[updater] Health check attempt $i failed, retrying..."
done

# --- Rollback ---
echo "[updater] Health check failed, rolling back..."
if [ "$MODE" = "brew" ]; then
  if [ -f "$CACHE_DIR/opentidy-$PREV_VERSION.rb" ]; then
    brew uninstall opentidy 2>&1 || true
    brew install --formula "$CACHE_DIR/opentidy-$PREV_VERSION.rb" 2>&1
    brew services restart opentidy 2>&1
    notify "Update v$NEW_VERSION echoue, rollback v$PREV_VERSION"
  else
    notify "Update v$NEW_VERSION echoue, rollback impossible (pas de cache)"
  fi
else
  # Git rollback: checkout previous version tag
  cd "$INSTALL_DIR"
  git checkout "v$PREV_VERSION" --quiet 2>/dev/null || git checkout HEAD~1 --quiet
  pnpm install --force --silent 2>&1 | tail -3
  pnpm build 2>&1 | tail -3
  pkill -f "node.*dist/cli.js.*start" 2>/dev/null || true
  sleep 1
  "$NODE_CMD" "$INSTALL_DIR/apps/backend/dist/cli.js" start \
    >> "$HOME/Library/Logs/opentidy-stdout.log" \
    2>> "$HOME/Library/Logs/opentidy-stderr.log" &
  disown
  notify "Update v$NEW_VERSION echoue, rollback v$PREV_VERSION"
fi

exit 1
