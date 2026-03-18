#!/bin/bash
set -euo pipefail

echo "[smoke-cleanup] Stopping smoke processes..."

# Kill backend
if [ -f /tmp/opentidy-smoke-backend.pid ]; then
  PID=$(cat /tmp/opentidy-smoke-backend.pid)
  if kill "$PID" 2>/dev/null; then
    echo "[smoke-cleanup] Backend (PID $PID) stopped"
  else
    echo "[smoke-cleanup] Backend (PID $PID) already stopped"
  fi
  rm /tmp/opentidy-smoke-backend.pid
fi

# Kill frontend
if [ -f /tmp/opentidy-smoke-frontend.pid ]; then
  PID=$(cat /tmp/opentidy-smoke-frontend.pid)
  if kill "$PID" 2>/dev/null; then
    echo "[smoke-cleanup] Frontend (PID $PID) stopped"
  else
    echo "[smoke-cleanup] Frontend (PID $PID) already stopped"
  fi
  rm /tmp/opentidy-smoke-frontend.pid
fi

# Reset fixture workspace to initial state
echo "[smoke-cleanup] Resetting fixture workspace..."
"$(dirname "$0")/smoke-setup.sh"

echo "[smoke-cleanup] Done"
