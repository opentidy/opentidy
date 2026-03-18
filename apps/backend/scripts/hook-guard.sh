#!/bin/bash
# Wrapper for PreToolUse guard hooks — only runs for OpenTidy sessions.
# Dev sessions (no opentidy- prefix) get an immediate ALLOW.
#
# Usage: hook-guard.sh <prompt-text>
# Receives hook payload as JSON on stdin.

set -euo pipefail

PAYLOAD=$(cat)
WORKSPACE_DIR="${OPENTIDY_WORKSPACE:-${HOME}/workspace}"
CWD=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# Not an OpenTidy session (cwd not inside workspace) → ALLOW immediately
if [[ -z "$CWD" || ! "$CWD" == *"$WORKSPACE_DIR"* ]]; then
  exit 0
fi

PROMPT="$1"
TOOL_INPUT=$(echo "$PAYLOAD" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null)

# Run one-shot Claude as verifier
RESULT=$(claude -p --system-prompt "$PROMPT" --allowedTools "" "Tool input: $TOOL_INPUT" 2>/dev/null || echo "ALLOW")

# Check if Claude said DENY
if echo "$RESULT" | grep -qi "DENY"; then
  echo '{"decision":"DENY","reason":"Hook guard rejected this action"}'
else
  exit 0
fi
