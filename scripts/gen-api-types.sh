#!/usr/bin/env bash
# Generate TypeScript types for the REST API from server OpenAPI.
# Defaults: server on localhost:8888

set -euo pipefail

PORT="${MIND_SWARM_PORT:-8888}"
API_BASE="${API_BASE:-http://localhost:${PORT}}"
OUT="${OUT:-src/api/types.ts}"

echo "[gen-api] Using API: ${API_BASE}/openapi.json"
mkdir -p "$(dirname "$OUT")"

if ! command -v npx >/dev/null 2>&1; then
  echo "[gen-api] npx not found. Install Node.js (>=16) to use this generator." >&2
  exit 1
fi

# Allow using a local schema file instead of live server
if [ -n "${OPENAPI_FILE:-}" ] && [ -f "$OPENAPI_FILE" ]; then
  echo "[gen-api] Using local schema: $OPENAPI_FILE"
  npx --yes openapi-typescript "$OPENAPI_FILE" -o "$OUT"
else
  # Try direct generation from live schema
  set +e
  npx --yes openapi-typescript "${API_BASE}/openapi.json" -o "$OUT"
  code=$?
  set -e
  if [ $code -ne 0 ]; then
    echo "[gen-api] Live generation failed (server down?). Trying cached schema..."
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "${API_BASE}/openapi.json" -o /tmp/mind-swarm-openapi.json
      npx --yes openapi-typescript /tmp/mind-swarm-openapi.json -o "$OUT"
    else
      echo "[gen-api] curl not found and live fetch failed. Aborting." >&2
      exit 1
    fi
  fi
fi

echo "[gen-api] Wrote $OUT"
