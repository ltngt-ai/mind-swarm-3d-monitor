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

# Optional: start local TTS server for OBS Browser Source (macOS Big Sur, etc.)
# - Set START_TTS=1 to launch scripts/tts-server.js on PORT (default 5002)
# - Or set TTS to a full URL to an existing TTS endpoint
TTS_URL="${TTS:-}"
TTS_PID=""
if [ "${START_TTS:-0}" = "1" ] && [ -z "$TTS_URL" ]; then
  PORT="${TTS_PORT:-5002}"
  if command -v node >/dev/null 2>&1; then
    if [ -f scripts/tts-server.js ]; then
      echo "🔊 Starting local TTS server on http://127.0.0.1:${PORT}/tts"
      TTS_LOG="${TTS_LOG:-.tts.log}"
      # Start TTS server in background with logging
      PORT="$PORT" node scripts/tts-server.js >> "$TTS_LOG" 2>&1 &
      TTS_PID=$!
      TTS_URL="http://127.0.0.1:${PORT}/tts"
      trap 'if [ -n "$TTS_PID" ]; then echo "🛑 Stopping TTS server ($TTS_PID)"; kill "$TTS_PID" 2>/dev/null || true; fi' EXIT INT TERM
      # Briefly wait and verify it is responding
      sleep 0.6 || true
      if ! curl -fsS -X OPTIONS --max-time 2 "$TTS_URL" >/dev/null 2>&1; then
        echo "⚠️  TTS server did not respond at $TTS_URL"
        echo "   Log (tail):"
        tail -n 40 "$TTS_LOG" || true
      else
        echo "   TTS server is up. Log: $TTS_LOG"
      fi
    else
      echo "⚠️  scripts/tts-server.js not found; skipping local TTS"
    fi
  else
    echo "⚠️  Node.js not found; cannot start local TTS"
  fi
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
if [ -n "$TTS_URL" ]; then
  # URL-encode minimal characters (& and spaces unlikely here)
  LAUNCH_URL+="&tts=${TTS_URL}"
fi
echo "🚀 Starting 3D monitor on http://localhost:5175"
echo "   Target server: ${SERVER_HOST}:${SERVER_PORT}"
if [ -n "$TTS_URL" ]; then
  echo "   TTS endpoint: ${TTS_URL}"
fi
echo "   Quick link: ${LAUNCH_URL}"
echo "   Click and drag to rotate camera"
echo "   Scroll to zoom"
echo ""

npm run dev
