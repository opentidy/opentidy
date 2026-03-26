#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd

# opentidy-updater.sh: Spawned by OpenTidy backend as detached process
# Env vars: BOT_TOKEN, CHAT_ID, NEW_VERSION, PREV_VERSION
set -euo pipefail

CACHE_DIR="$HOME/.cache/opentidy/releases"
mkdir -p "$CACHE_DIR"

notify() {
  if [ -n "${BOT_TOKEN:-}" ] && [ -n "${CHAT_ID:-}" ]; then
    curl -sf "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
      -d "chat_id=$CHAT_ID" \
      -d "text=$1" > /dev/null 2>&1 || true
  fi
}

# Cache current formula for rollback
FORMULA_PATH="$(brew formula opentidy 2>/dev/null || true)"
if [ -n "$FORMULA_PATH" ] && [ -f "$FORMULA_PATH" ]; then
  cp "$FORMULA_PATH" "$CACHE_DIR/opentidy-$PREV_VERSION.rb"
fi

# Upgrade
echo "[updater] Upgrading opentidy..."
brew upgrade opentidy 2>&1 || {
  notify "brew upgrade opentidy failed"
  exit 1
}

echo "[updater] Restarting..."
brew services restart opentidy 2>&1

# Health check (retry 3 times, 10s apart)
for i in 1 2 3; do
  sleep 10
  if curl -sf http://localhost:5175/api/health > /dev/null 2>&1; then
    notify "OpenTidy v$NEW_VERSION en ligne"
    # Prune old cached releases (keep last 3)
    ls -t "$CACHE_DIR"/opentidy-*.rb 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true
    echo "[updater] Update successful"
    exit 0
  fi
  echo "[updater] Health check attempt $i failed, retrying..."
done

# Rollback
echo "[updater] Health check failed, rolling back..."
if [ -f "$CACHE_DIR/opentidy-$PREV_VERSION.rb" ]; then
  brew uninstall opentidy 2>&1 || true
  brew install --formula "$CACHE_DIR/opentidy-$PREV_VERSION.rb" 2>&1
  brew services restart opentidy 2>&1
  notify "Update v$NEW_VERSION echoue, rollback v$PREV_VERSION"
else
  notify "Update v$NEW_VERSION echoue, rollback impossible (pas de cache)"
fi

exit 1
