#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd

# OpenTidy installer
# Usage: curl -fsSL https://opentidy.com/install.sh | bash
#
# Silent, non-interactive. Safe to re-run.
set -euo pipefail

# --- Config ---
REPO="https://github.com/opentidy/opentidy.git"
INSTALL_DIR="${OPENTIDY_DIR:-$HOME/Documents/opentidy}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opentidy"
PORT="${OPENTIDY_PORT:-5175}"
REQUIRED_NODE_MAJOR=22

# --- Color helpers ---
log()  { printf "\033[34m  → %s\033[0m\n" "$*"; }
ok()   { printf "\033[32m  ✓ %s\033[0m\n" "$*"; }
dim()  { printf "\033[90m    %s\033[0m\n" "$*"; }
warn() { printf "\033[33m  ! %s\033[0m\n" "$*"; }

printf "\n\033[1m  OpenTidy\033[0m\n\n"

# --- PATH setup ---
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

# --- Homebrew ---
log "Checking Homebrew..."
if ! command -v brew &>/dev/null; then
  dim "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  ok "Homebrew installed"
else
  ok "Homebrew already installed"
fi

# --- Node.js 22 (forced) ---
log "Checking Node.js $REQUIRED_NODE_MAJOR..."
brew install "node@$REQUIRED_NODE_MAJOR" &>/dev/null || true
NODE_DIR="$(brew --prefix "node@$REQUIRED_NODE_MAJOR")/bin"
NODE_CMD="$NODE_DIR/node"
# Force node@22 first in PATH (overrides nvm, volta, etc.)
export PATH="$NODE_DIR:$PATH"
ok "Node.js $("$NODE_CMD" --version)"

ok "Node.js $(node --version)"

# --- System dependencies ---
log "Checking dependencies (pnpm, tmux, ttyd)..."
for dep in pnpm tmux ttyd; do
  brew install "$dep" &>/dev/null || true
done
ok "Dependencies ready"

# --- Clone / pull repo ---
log "Setting up repo at $INSTALL_DIR..."
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --ff-only --quiet
  dim "Pulled latest"
else
  git clone --quiet "$REPO" "$INSTALL_DIR"
  dim "Cloned repo"
fi
ok "Repo ready"

# --- Build ---
log "Installing dependencies and building..."
cd "$INSTALL_DIR"

# Approve native build scripts (pnpm 10+)
if ! grep -q 'better-sqlite3' .npmrc 2>/dev/null; then
  echo "onlyBuiltDependencies=better-sqlite3,esbuild" >> .npmrc
fi

# Enable pnpm via corepack to ensure it uses the correct node@22
corepack enable pnpm &>/dev/null || true
pnpm install --force --silent
pnpm build &>/dev/null
ok "Build complete"

# --- Config ---
log "Checking config..."
mkdir -p "$CONFIG_DIR"
CONFIG_FILE="$CONFIG_DIR/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  BEARER_TOKEN="$(openssl rand -hex 32)"
  cat > "$CONFIG_FILE" <<JSON
{
  "version": 3,
  "auth": { "bearerToken": "$BEARER_TOKEN" },
  "server": { "port": $PORT, "appBaseUrl": "http://localhost:$PORT" },
  "workspace": { "dir": "", "lockDir": "/tmp/opentidy-locks" },
  "update": { "autoUpdate": true, "checkInterval": "6h", "notifyBeforeUpdate": true, "delayBeforeUpdate": "5m", "keepReleases": 3 },
  "agentConfig": { "name": "claude", "configDir": "$CONFIG_DIR/agents/claude" },
  "claudeConfig": { "dir": "$CONFIG_DIR/agents/claude" },
  "language": "en",
  "userInfo": { "name": "", "email": "", "company": "" },
  "modules": { "opentidy": { "enabled": true, "source": "curated" } }
}
JSON
  ok "Config created"
else
  ok "Config exists"
fi

# --- LaunchAgent (for future reboots) ---
log "Installing service..."
PLIST_SRC="$INSTALL_DIR/com.opentidy.agent.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.opentidy.agent.plist"

mkdir -p "$HOME/Library/LaunchAgents"
launchctl unload "$PLIST_DST" 2>/dev/null || true

sed -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

launchctl load "$PLIST_DST" 2>/dev/null || true

# Start server directly (more reliable than LaunchAgent for first run)
pkill -f "node.*dist/cli.js.*start" 2>/dev/null || true
sleep 1
"$NODE_CMD" "$INSTALL_DIR/apps/backend/dist/cli.js" start \
  >> "$HOME/Library/Logs/opentidy-stdout.log" \
  2>> "$HOME/Library/Logs/opentidy-stderr.log" &
disown
ok "Service started"

# --- Health check ---
log "Waiting for server on port $PORT..."
deadline=$((SECONDS + 30))
healthy=false
while [ $SECONDS -lt $deadline ]; do
  if curl -sf "http://localhost:$PORT/api/health" &>/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" = true ]; then
  ok "Server is up"
else
  warn "Server did not respond within 30s; port $PORT may be in use"
  warn "Check logs: opentidy logs"
fi

# --- Open browser (skip in SSH/headless) ---
if [ "$healthy" = true ] && [ -z "${SSH_CLIENT:-}" ]; then
  open "http://localhost:$PORT" 2>/dev/null || true
fi

# --- Done ---
printf "\n\033[1m  OpenTidy is running.\033[0m\n"
dim "http://localhost:$PORT"
dim "opentidy doctor   verify setup"
dim "opentidy logs     tail logs"
printf "\n"
