#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

export WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../fixtures/smoke-workspace" && pwd)"
export PORT=3099
export SWEEP_INTERVAL_MS=999999999  # disable auto sweep in smoke
export NODE_ENV=test

echo "[smoke-start] Workspace: $WORKSPACE_DIR"
echo "[smoke-start] Building backend..."

cd "$ROOT_DIR"
pnpm --filter @opentidy/backend build

# Start backend
cd "$ROOT_DIR/apps/backend"
node dist/index.js &
BACKEND_PID=$!
echo "[smoke-start] Backend PID: $BACKEND_PID (port $PORT)"
echo $BACKEND_PID > /tmp/opentidy-smoke-backend.pid

# Start web dev server
cd "$ROOT_DIR/apps/web"
npx vite --port 5173 &
FRONTEND_PID=$!
echo "[smoke-start] Frontend PID: $FRONTEND_PID (port 5173)"
echo $FRONTEND_PID > /tmp/opentidy-smoke-frontend.pid

echo ""
echo "[smoke-start] Smoke environment ready"
echo "  Backend:  http://localhost:$PORT"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Run smoke tests with /test commands (see scripts/README-smoke.md)"
echo "Cleanup with: ./scripts/smoke-cleanup.sh"

# Wait for both processes
wait
