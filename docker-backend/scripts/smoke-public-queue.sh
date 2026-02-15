#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

BODY_FILE="$WORKDIR/queue-health.json"
HEADERS_FILE="$WORKDIR/queue-health.headers"

echo "== Docker Backend Queue Smoke =="
echo "Backend URL: $BACKEND_URL"
echo "Expected queue backend: $EXPECTED_QUEUE_BACKEND"

if ! curl -sS -D "$HEADERS_FILE" "${BACKEND_URL%/}/api/health/public-api-queue" -o "$BODY_FILE"; then
  echo "failed to reach ${BACKEND_URL%/}/api/health/public-api-queue" >&2
  echo "hint: set BACKEND_URL explicitly (example: BACKEND_URL=https://docker.recoder.xyz)" >&2
  exit 1
fi
STATUS="$(head -n 1 "$HEADERS_FILE" | awk '{print $2}')"

if [[ "$STATUS" -lt 200 || "$STATUS" -ge 400 ]]; then
  echo "queue health endpoint failed with HTTP $STATUS" >&2
  cat "$HEADERS_FILE" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

SELECTED_BACKEND="$(
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(p?.queue?.selectedBackend||'');" "$BODY_FILE"
)"
CONFIGURED_BACKEND="$(
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(p?.queue?.configuredBackend||'');" "$BODY_FILE"
)"
HAS_REDIS_URL="$(
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(Boolean(p?.queue?.hasRedisUrl));" "$BODY_FILE"
)"

echo "configuredBackend=$CONFIGURED_BACKEND selectedBackend=$SELECTED_BACKEND hasRedisUrl=$HAS_REDIS_URL"

if [[ "$SELECTED_BACKEND" != "$EXPECTED_QUEUE_BACKEND" ]]; then
  echo "queue backend mismatch: expected '$EXPECTED_QUEUE_BACKEND' but got '$SELECTED_BACKEND'" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

if [[ "$EXPECTED_QUEUE_BACKEND" == "redis" && "$HAS_REDIS_URL" != "true" ]]; then
  echo "redis backend selected but REDIS_URL is missing/unavailable" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

echo "== Queue smoke passed =="

READINESS_BODY="$WORKDIR/byok-readiness.json"
READINESS_HEADERS="$WORKDIR/byok-readiness.headers"
curl -sS -D "$READINESS_HEADERS" "${BACKEND_URL%/}/api/health/byok-readiness" -o "$READINESS_BODY"
READINESS_STATUS="$(head -n 1 "$READINESS_HEADERS" | awk '{print $2}')"

if [[ "$READINESS_STATUS" -lt 200 || "$READINESS_STATUS" -ge 400 ]]; then
  echo "byok readiness endpoint failed with HTTP $READINESS_STATUS" >&2
  cat "$READINESS_HEADERS" >&2
  cat "$READINESS_BODY" >&2
  exit 1
fi

OVERALL_READY="$(
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(Boolean(p?.overallReady));" "$READINESS_BODY"
)"
if [[ "$OVERALL_READY" != "true" ]]; then
  echo "byok readiness is not ready" >&2
  cat "$READINESS_BODY" >&2
  exit 1
fi

echo "== BYOK readiness smoke passed =="
