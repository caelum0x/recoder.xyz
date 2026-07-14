#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"
STRICT_QUEUE_CONTRACT="${STRICT_QUEUE_CONTRACT:-false}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

BODY_FILE="$WORKDIR/queue-health.json"
HEADERS_FILE="$WORKDIR/queue-health.headers"

echo "== Docker Backend Queue Smoke =="
echo "Backend URL: $BACKEND_URL"
echo "Expected queue backend: $EXPECTED_QUEUE_BACKEND"
echo "Strict queue contract: $STRICT_QUEUE_CONTRACT"

QUEUE_ENDPOINT=""
QUEUE_CANDIDATES=(
  "/api/health/public-api-queue"
  "/health"
)

for p in "${QUEUE_CANDIDATES[@]}"; do
  if curl -sS -D "$HEADERS_FILE" "${BACKEND_URL%/}${p}" -o "$BODY_FILE"; then
    STATUS="$(head -n 1 "$HEADERS_FILE" | awk '{print $2}')"
    if [[ "$STATUS" -ge 200 && "$STATUS" -lt 400 ]]; then
      QUEUE_ENDPOINT="$p"
      break
    fi
  fi
done

if [[ -z "$QUEUE_ENDPOINT" ]]; then
  echo "queue health endpoint failed for candidates: ${QUEUE_CANDIDATES[*]}" >&2
  cat "$HEADERS_FILE" >&2 || true
  cat "$BODY_FILE" >&2 || true
  exit 1
fi

echo "queue health endpoint selected: $QUEUE_ENDPOINT (HTTP $STATUS)"

SELECTED_BACKEND="$(
  node -e "const fs=require('fs');try{const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(p?.queue?.selectedBackend||'');}catch{console.log('');}" "$BODY_FILE"
)"
CONFIGURED_BACKEND="$(
  node -e "const fs=require('fs');try{const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(p?.queue?.configuredBackend||'');}catch{console.log('');}" "$BODY_FILE"
)"
HAS_REDIS_URL="$(
  node -e "const fs=require('fs');try{const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(Boolean(p?.queue?.hasRedisUrl));}catch{console.log('false');}" "$BODY_FILE"
)"

if [[ -n "$SELECTED_BACKEND" || -n "$CONFIGURED_BACKEND" ]]; then
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
else
  if [[ "$STRICT_QUEUE_CONTRACT" == "true" ]]; then
    echo "queue contract payload missing (set STRICT_QUEUE_CONTRACT=false to allow generic health fallback)" >&2
    cat "$BODY_FILE" >&2 || true
    exit 1
  fi
  echo "queue contract payload not present; generic health check passed."
fi

echo "== Queue smoke passed =="

READINESS_BODY="$WORKDIR/byok-readiness.json"
READINESS_HEADERS="$WORKDIR/byok-readiness.headers"
READINESS_ENDPOINT=""
READINESS_CANDIDATES=(
  "/api/health/byok-readiness"
  "/health"
)
for p in "${READINESS_CANDIDATES[@]}"; do
  if curl -sS -D "$READINESS_HEADERS" "${BACKEND_URL%/}${p}" -o "$READINESS_BODY"; then
    READINESS_STATUS="$(head -n 1 "$READINESS_HEADERS" | awk '{print $2}')"
    if [[ "$READINESS_STATUS" -ge 200 && "$READINESS_STATUS" -lt 400 ]]; then
      READINESS_ENDPOINT="$p"
      break
    fi
  fi
done

if [[ -z "$READINESS_ENDPOINT" ]]; then
  echo "byok readiness endpoint failed for candidates: ${READINESS_CANDIDATES[*]}" >&2
  cat "$READINESS_HEADERS" >&2 || true
  cat "$READINESS_BODY" >&2 || true
  exit 1
fi

echo "byok readiness endpoint selected: $READINESS_ENDPOINT (HTTP $READINESS_STATUS)"

OVERALL_READY="$(
  node -e "const fs=require('fs');try{const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(typeof p?.overallReady==='boolean'){console.log(String(p.overallReady));}else{console.log('unknown');}}catch{console.log('unknown');}" "$READINESS_BODY"
)"
if [[ "$OVERALL_READY" == "false" ]]; then
  echo "byok readiness is not ready" >&2
  cat "$READINESS_BODY" >&2
  exit 1
fi
if [[ "$OVERALL_READY" == "unknown" ]]; then
  echo "byok readiness payload not present; generic health fallback used."
fi

echo "== BYOK readiness smoke passed =="
