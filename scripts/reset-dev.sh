#!/bin/bash
# Reset OpenTidy dev environment — wipe all data, kill all processes, restart clean
# Usage: ./scripts/reset-dev.sh

set -e

WORKSPACE="${OPENTIDY_WORKSPACE:-$(dirname "$0")/../workspace}"
cd "$(dirname "$0")/.."

echo "[reset] Killing processes..."
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "chromium" 2>/dev/null || true
pkill -f "browser-bridge" 2>/dev/null || true
pkill -f "ttyd" 2>/dev/null || true
lsof -ti :5175 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti :5173 2>/dev/null | xargs kill -9 2>/dev/null || true
tmux kill-server 2>/dev/null || true
sleep 2

echo "[reset] Wiping workspace..."
# Remove all job directories (anything not starting with _ or .)
cd "$WORKSPACE"
for d in */; do
  name="${d%/}"
  [[ "$name" != _* && "$name" != .* ]] && rm -rf "$d"
done
cd - > /dev/null

# Wipe DB
rm -f "$WORKSPACE/_data/opentidy.db" "$WORKSPACE/_data/opentidy.db-wal" "$WORKSPACE/_data/opentidy.db-shm"

# Wipe suggestions, gaps, memory
find "$WORKSPACE/_suggestions" -name "*.md" -delete 2>/dev/null || true
rm -f "$WORKSPACE/_gaps/gaps.md"
find "$WORKSPACE/_memory" -name "*.md" -delete 2>/dev/null || true

# Wipe locks
find /tmp -path "*/opentidy*/locks/*.lock" -delete 2>/dev/null || true
find "$TMPDIR" -path "*/opentidy*/locks/*.lock" -delete 2>/dev/null || true

# Recreate structure
mkdir -p "$WORKSPACE"/{_suggestions,_gaps,_audit,_memory,_data,_outputs,.claude}

echo "[reset] Starting services..."
pnpm --filter @opentidy/backend dev &
sleep 5
pnpm --filter @opentidy/web dev &
sleep 2

echo "[reset] Done."
echo "  Backend: http://localhost:5175"
echo "  Frontend: http://localhost:5173"
curl -s http://localhost:5175/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Health: {d[\"status\"]}, uptime: {d[\"uptime\"]:.0f}s')" 2>/dev/null || echo "  Health: NOT READY"
