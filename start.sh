#!/bin/bash

set -euo pipefail

echo "🌐 Mind-Swarm 3D Monitor"
echo "======================"

# Resolve target Mind‑Swarm server (defaults to 192.168.1.129:8888)
# You can set either SERVER="host:port" or MIND_SWARM_HOST/MIND_SWARM_PORT
SERVER_HOST="${MIND_SWARM_HOST:-}"
SERVER_PORT="${MIND_SWARM_PORT:-8888}"
if [ -n "${SERVER:-}" ]; then
  SERVER_HOST="${SERVER%%:*}"
  rest="${SERVER#*:}"
  if [ "$rest" != "$SERVER" ]; then SERVER_PORT="$rest"; fi
fi
if [ -z "$SERVER_HOST" ]; then SERVER_HOST="192.168.1.129"; fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Optional server reachability check (skip with SKIP_SERVER_CHECK=1)
if [ "${SKIP_SERVER_CHECK:-0}" != "1" ]; then
  if ! curl -fsS --max-time 2 "http://${SERVER_HOST}:${SERVER_PORT}/" > /dev/null 2>&1; then
    echo "ℹ️  Note: Mind‑Swarm server not reachable at ${SERVER_HOST}:${SERVER_PORT} (or no / root endpoint)."
    echo "    This is fine if you're using a remote server or it has a different base path."
    echo "    You can also skip this check: SKIP_SERVER_CHECK=1 ./start.sh"
    echo ""
  fi
fi

LAUNCH_URL="http://localhost:5175/?server=${SERVER_HOST}:${SERVER_PORT}"
echo "🚀 Starting 3D monitor on http://localhost:5175"
echo "   Target server: ${SERVER_HOST}:${SERVER_PORT}"
echo "   Quick link: ${LAUNCH_URL}"
echo "   Click and drag to rotate camera"
echo "   Scroll to zoom"
echo ""

npm run dev
