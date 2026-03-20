#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd

# OpenTidy installer
# Usage: curl -fsSL https://raw.githubusercontent.com/opentidy/opentidy/main/install.sh | bash
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

# --- Node.js 22 ---
log "Checking Node.js $REQUIRED_NODE_MAJOR..."
# Check if node@22 is already available (via brew install node or node@22)
NODE_BIN=""
if brew list "node@$REQUIRED_NODE_MAJOR" &>/dev/null; then
  NODE_BIN="$(brew --prefix "node@$REQUIRED_NODE_MAJOR")/bin"
elif command -v node &>/dev/null; then
  SYS_MAJOR="$(node --version 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
  if [ "$SYS_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
    NODE_BIN="$(dirname "$(command -v node)")"
    dim "Using system Node.js $(node --version)"
  fi
fi
if [ -z "$NODE_BIN" ]; then
  brew install "node@$REQUIRED_NODE_MAJOR" &>/dev/null || true
  NODE_BIN="$(brew --prefix "node@$REQUIRED_NODE_MAJOR")/bin"
fi
export PATH="$NODE_BIN:$PATH"

# Persist node@22 in the user's shell rc file (idempotent)
SHELL_NAME="$(basename "${SHELL:-/bin/zsh}")"
case "$SHELL_NAME" in
  zsh)  RC_FILE="${ZDOTDIR:-$HOME}/.zshrc" ;;
  bash) RC_FILE="$HOME/.bashrc" ;;
  fish) RC_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" ;;
  *)    RC_FILE="$HOME/.profile" ;;
esac
if ! grep -q "node@$REQUIRED_NODE_MAJOR" "$RC_FILE" 2>/dev/null; then
  if [ "$SHELL_NAME" = "fish" ]; then
    echo "set -gx PATH $NODE_BIN \$PATH" >> "$RC_FILE"
  else
    echo "export PATH=\"$NODE_BIN:\$PATH\"" >> "$RC_FILE"
  fi
fi

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

pnpm install --silent
pnpm build --silent
ok "Build complete"

# --- Config ---
log "Checking config..."
mkdir -p "$CONFIG_DIR"
CONFIG_FILE="$CONFIG_DIR/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  BEARER_TOKEN="$(openssl rand -hex 32)"
  cat > "$CONFIG_FILE" <<JSON
{
  "version": 2,
  "auth": {
    "bearerToken": "$BEARER_TOKEN"
  },
  "server": {
    "port": $PORT,
    "appBaseUrl": "http://localhost:$PORT"
  },
  "telegram": {
    "botToken": "",
    "chatId": ""
  },
  "workspace": {
    "dir": "",
    "lockDir": ""
  },
  "update": {
    "autoUpdate": true,
    "checkInterval": "6h",
    "notifyBeforeUpdate": false,
    "delayBeforeUpdate": "0m",
    "keepReleases": 2
  },
  "agentConfig": {
    "name": "claude",
    "configDir": ""
  },
  "language": "en",
  "receivers": [],
  "userInfo": {
    "name": "",
    "email": "",
    "company": ""
  },
  "mcp": {
    "curated": {
      "gmail": { "enabled": false, "configured": false },
      "camoufox": { "enabled": false, "configured": false },
      "whatsapp": { "enabled": false, "configured": false, "wacliPath": "", "mcpServerPath": "" }
    },
    "marketplace": {}
  },
  "skills": {
    "curated": {},
    "user": []
  }
}
JSON
  ok "Config created at $CONFIG_FILE"
else
  ok "Config already exists"
fi

# --- LaunchAgent ---
log "Installing LaunchAgent..."
PLIST_SRC="$INSTALL_DIR/com.opentidy.agent.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.opentidy.agent.plist"

mkdir -p "$HOME/Library/LaunchAgents"
launchctl unload "$PLIST_DST" 2>/dev/null || true

sed -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

launchctl load "$PLIST_DST"
ok "LaunchAgent loaded"

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
  warn "Server did not respond within 30s — port $PORT may be in use"
  warn "Check logs: opentidy logs"
fi

# --- Open browser (skip in SSH/headless) ---
if [ "$healthy" = true ] && [ -z "${SSH_CLIENT:-}" ]; then
  open "http://localhost:$PORT" 2>/dev/null || true
fi

# --- Done ---
printf "\n\033[1m  OpenTidy is running.\033[0m\n"
dim "http://localhost:$PORT"
dim "opentidy doctor   — verify setup"
dim "opentidy logs     — tail logs"
printf "\n"
