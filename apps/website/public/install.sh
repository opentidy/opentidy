#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Loaddr Ltd

# OpenTidy installer / uninstaller
# Install:    curl -fsSL https://opentidy.com/install.sh | bash
# Uninstall:  curl -fsSL https://opentidy.com/install.sh | bash -s -- --uninstall
#
# Wrapped in main() so the entire script is downloaded before execution.

main() {
set -euo pipefail

# --- Color helpers ---
log()  { printf "\033[34m  → %s\033[0m\n" "$*"; }
ok()   { printf "\033[32m  ✓ %s\033[0m\n" "$*"; }
dim()  { printf "\033[90m    %s\033[0m\n" "$*"; }
warn() { printf "\033[33m  ! %s\033[0m\n" "$*"; }

# --- PATH setup ---
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

# --- Uninstall ---
if [ "${1:-}" = "--uninstall" ]; then
  printf "\n\033[1m  OpenTidy — Uninstall\033[0m\n\n"

  log "Stopping service..."
  brew services stop opentidy 2>/dev/null || true
  ok "Service stopped"

  log "Uninstalling..."
  brew uninstall --force opentidy 2>/dev/null || true
  brew untap opentidy/opentidy 2>/dev/null || true
  rm -rf /opt/homebrew/Cellar/opentidy ~/Library/Caches/Homebrew/opentidy* 2>/dev/null || true
  ok "Homebrew package removed"

  log "Removing config..."
  rm -rf ~/.config/opentidy 2>/dev/null || true
  ok "Config removed"

  printf "\n\033[1m  OpenTidy uninstalled.\033[0m\n\n"
  return 0
fi

# --- Install ---
printf "\n\033[1m  OpenTidy\033[0m\n\n"

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
  ok "Homebrew ready"
fi

# --- Install OpenTidy ---
log "Installing OpenTidy..."
brew tap opentidy/opentidy 2>/dev/null || true
if brew list opentidy &>/dev/null; then
  brew upgrade opentidy 2>/dev/null || dim "Already up to date"
  ok "OpenTidy updated"
else
  brew install opentidy
  ok "OpenTidy installed"
fi

# --- Start service ---
log "Starting service..."
brew services start opentidy 2>/dev/null || true
ok "Service started"

# --- Health check ---
PORT=5175
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
  warn "Server did not respond within 30s"
  warn "Check logs: opentidy logs"
fi

# --- Open browser ---
if [ "$healthy" = true ] && [ -z "${SSH_CLIENT:-}" ]; then
  open "http://localhost:$PORT" 2>/dev/null || true
fi

# --- Done ---
printf "\n\033[1m  OpenTidy is running.\033[0m\n"
dim "http://localhost:$PORT"
dim "opentidy setup   — complete first-time configuration"
dim "opentidy stop    — stop the service"
dim "opentidy update  — check for updates"
dim "opentidy logs    — tail logs"
printf "\n"
}

main "$@"
