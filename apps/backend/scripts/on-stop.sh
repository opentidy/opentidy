#!/bin/bash
# Hook "Stop" — fires every time Claude finishes responding.
# Always signals the backend so it can mark the session as idle.

set -euo pipefail

PAYLOAD=$(cat)
WORKSPACE_DIR="${ALFRED_WORKSPACE:-$HOME/Documents/alfred/workspace}"
BACKEND_PORT="${ALFRED_PORT:-5174}"
LOG_FILE="$HOME/Library/Logs/alfred-hooks.log"

log() { echo "[on-stop $(date '+%H:%M:%S')] $*" >> "$LOG_FILE"; }

# Extract dossier ID from cwd
CWD=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# Only Alfred sessions (cwd must be inside the workspace)
if [[ -z "$CWD" || ! "$CWD" == *"/workspace/"* ]]; then
  exit 0
fi

DOSSIER_ID=$(basename "$CWD")
SESSION_ID="alfred-${DOSSIER_ID}"
STATE_FILE="$WORKSPACE_DIR/$DOSSIER_ID/state.md"

if [[ ! -f "$STATE_FILE" ]]; then
  log "$DOSSIER_ID: no state.md, skipping"
  exit 0
fi

STATE_CONTENT=$(cat "$STATE_FILE")

# Detect state from state.md
if echo "$STATE_CONTENT" | grep -qi "STATUT.*TERMIN"; then
  STATE="TERMINÉ"
else
  STATE="EN COURS"
fi

log "$DOSSIER_ID → $STATE, signaling backend"

# Always signal the backend — it handles marking idle, notifications, etc.
curl -sf -X POST "http://localhost:$BACKEND_PORT/api/hooks" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"hook_event_name\":\"Stop\",\"cwd\":\"$CWD\",\"tool_name\":\"state:$STATE\"}" \
  2>/dev/null || true
