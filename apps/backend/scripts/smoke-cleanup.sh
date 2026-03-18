#!/bin/bash
set -euo pipefail

echo "[smoke-cleanup] Stopping smoke processes..."

# Kill backend
if [ -f /tmp/alfred-smoke-backend.pid ]; then
  PID=$(cat /tmp/alfred-smoke-backend.pid)
  if kill "$PID" 2>/dev/null; then
    echo "[smoke-cleanup] Backend (PID $PID) stopped"
  else
    echo "[smoke-cleanup] Backend (PID $PID) already stopped"
  fi
  rm /tmp/alfred-smoke-backend.pid
fi

# Kill frontend
if [ -f /tmp/alfred-smoke-frontend.pid ]; then
  PID=$(cat /tmp/alfred-smoke-frontend.pid)
  if kill "$PID" 2>/dev/null; then
    echo "[smoke-cleanup] Frontend (PID $PID) stopped"
  else
    echo "[smoke-cleanup] Frontend (PID $PID) already stopped"
  fi
  rm /tmp/alfred-smoke-frontend.pid
fi

# Reset fixture workspace to initial state
echo "[smoke-cleanup] Resetting fixture workspace..."
"$(dirname "$0")/smoke-setup.sh"

echo "[smoke-cleanup] Done"
