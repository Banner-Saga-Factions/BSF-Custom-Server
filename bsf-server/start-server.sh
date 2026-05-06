#!/usr/bin/env bash
# start-server.sh — Linux / macOS equivalent of start-server.bat
#
# Builds TypeScript, kills any stale `node build/index.js` process bound to
# port 8082, then starts a fresh process. Always use this (not a bare
# `node build/index.js`) after code changes — running a stale build is the
# #1 cause of "my change isn't working".
#
# Usage: ./start-server.sh

set -euo pipefail

PORT="${PORT:-8082}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[start-server] Building TypeScript..."
yarn build

echo "[start-server] Killing any process on port $PORT..."
if command -v lsof >/dev/null 2>&1; then
    # macOS + most Linux
    PIDS="$(lsof -ti tcp:"$PORT" || true)"
elif command -v fuser >/dev/null 2>&1; then
    # Minimal Linux containers without lsof
    PIDS="$(fuser -n tcp "$PORT" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)"
else
    echo "[start-server] Neither lsof nor fuser found — skipping port cleanup."
    PIDS=""
fi

if [ -n "$PIDS" ]; then
    echo "[start-server] Killing PID(s): $PIDS"
    # shellcheck disable=SC2086
    kill -9 $PIDS || true
    sleep 1
else
    echo "[start-server] No stale process on port $PORT."
fi

echo "[start-server] Starting fresh node build/index.js on :$PORT ..."
exec node build/index.js
