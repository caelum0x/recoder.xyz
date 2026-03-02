#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RECODER_WEB_URL="${RECODER_WEB_URL:-https://web.recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"
STRICT_READINESS_CONTRACT="${STRICT_READINESS_CONTRACT:-false}"

extract_json_field() {
  local file="$1"
  local path="$2"
  node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const keys = process.argv[2].split('.');
let cur = data;
for (const k of keys) {
  if (cur == null) break;
  cur = cur[k];
}
if (cur === undefined || cur === null) process.exit(2);
if (typeof cur === 'object') console.log(JSON.stringify(cur));
else console.log(String(cur));
" "$file" "$path"
}

check_health_json() {
  local name="$1"
  local url="$2"
  local body_file="$3"
  local headers_file="$4"
  local curl_stderr_file="${headers_file}.curl-stderr"

  if ! curl -sS -D "$headers_file" "$url" -o "$body_file" 2>"$curl_stderr_file"; then
    echo "$name failed: could not reach $url" >&2
    if grep -qi "Could not resolve host" "$curl_stderr_file"; then
      echo "diagnostic: DNS resolution failed from this runner (check runner network/DNS)." >&2
    fi
    cat "$curl_stderr_file" >&2
    exit 1
  fi

  local status
  status="$(head -n 1 "$headers_file" | awk '{print $2}')"
  echo "$name HTTP $status"
  if [[ "$status" -lt 200 || "$status" -ge 400 ]]; then
    echo "$name failed with HTTP $status" >&2
    if [[ "$status" == "404" ]]; then
      echo "diagnostic: endpoint route is missing on deployed service or ingress." >&2
    fi
    cat "$body_file" >&2
    exit 1
  fi
}

check_health_with_fallback() {
  local name="$1"
  local body_file="$2"
  local headers_file="$3"
  shift 3
  local candidates=("$@")
  local selected=""
  for p in "${candidates[@]}"; do
    local full="${RECODER_WEB_URL%/}${p}"
    if curl -sS -D "$headers_file" "$full" -o "$body_file"; then
      local status
      status="$(head -n 1 "$headers_file" | awk '{print $2}')"
      if [[ "$status" -ge 200 && "$status" -lt 400 ]]; then
        selected="$p"
        echo "$name selected endpoint: $p (HTTP $status)"
        break
      fi
    fi
  done
  if [[ -z "$selected" ]]; then
    echo "$name failed for all candidate endpoints: ${candidates[*]}" >&2
    cat "$headers_file" >&2 || true
    cat "$body_file" >&2 || true
    exit 1
  fi
}

echo "== Section 2 Production Blockers Smoke =="
echo "recoder-web: $RECODER_WEB_URL"
echo "docker-backend: $BACKEND_URL"
echo "expectedQueueBackend: $EXPECTED_QUEUE_BACKEND"
echo "strictReadinessContract: $STRICT_READINESS_CONTRACT"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo ""
echo "1) recoder-web BYOK readiness"
RW_BYOK_BODY="$WORKDIR/recoder-web-byok-readiness.json"
RW_BYOK_HEADERS="$WORKDIR/recoder-web-byok-readiness.headers"
check_health_with_fallback \
  "recoder-web readiness" \
  "$RW_BYOK_BODY" \
  "$RW_BYOK_HEADERS" \
  "/api/health/byok-readiness" \
  "/api/health"
RW_BYOK_READY="$(extract_json_field "$RW_BYOK_BODY" "overallReady" || echo "unknown")"
if [[ "$RW_BYOK_READY" == "false" ]]; then
  echo "recoder-web byok readiness is not ready" >&2
  cat "$RW_BYOK_BODY" >&2
  exit 1
fi
if [[ "$RW_BYOK_READY" == "unknown" ]]; then
  if [[ "$STRICT_READINESS_CONTRACT" == "true" ]]; then
    echo "recoder-web readiness payload missing overallReady (strict mode)" >&2
    cat "$RW_BYOK_BODY" >&2
    exit 1
  fi
  echo "recoder-web readiness payload missing overallReady; generic health check used."
fi

echo ""
echo "2) recoder-web public-api readiness (docker-backend bridge)"
RW_PUBLIC_BODY="$WORKDIR/recoder-web-public-api-readiness.json"
RW_PUBLIC_HEADERS="$WORKDIR/recoder-web-public-api-readiness.headers"
check_health_with_fallback \
  "recoder-web public-api readiness" \
  "$RW_PUBLIC_BODY" \
  "$RW_PUBLIC_HEADERS" \
  "/api/health/public-api-readiness" \
  "/api/health"
RW_PUBLIC_READY="$(extract_json_field "$RW_PUBLIC_BODY" "overallReady" || echo "unknown")"
if [[ "$RW_PUBLIC_READY" == "false" ]]; then
  echo "recoder-web public-api readiness is not ready" >&2
  cat "$RW_PUBLIC_BODY" >&2
  exit 1
fi
if [[ "$RW_PUBLIC_READY" == "unknown" ]]; then
  if [[ "$STRICT_READINESS_CONTRACT" == "true" ]]; then
    echo "recoder-web public-api readiness payload missing overallReady (strict mode)" >&2
    cat "$RW_PUBLIC_BODY" >&2
    exit 1
  fi
  echo "recoder-web public-api readiness payload missing overallReady; generic health check used."
fi

echo ""
echo "3) docker-backend queue + BYOK readiness"
BACKEND_URL="$BACKEND_URL" EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" \
  bash "$REPO_ROOT/docker-backend/scripts/smoke-public-queue.sh"

echo ""
echo "4) billing mode decision check"
BILLING_MODE_RAW="${BILLING_ACTIONS_ENABLED:-}"
if [[ -z "$BILLING_MODE_RAW" ]]; then
  echo "BILLING_ACTIONS_ENABLED is not set in this shell." >&2
  echo "Set it explicitly to 'true' or 'false' to record the decision for deploy ops." >&2
  exit 1
fi

BILLING_MODE="$(echo "$BILLING_MODE_RAW" | tr '[:upper:]' '[:lower:]')"
if [[ "$BILLING_MODE" != "true" && "$BILLING_MODE" != "false" ]]; then
  echo "Invalid BILLING_ACTIONS_ENABLED='$BILLING_MODE_RAW' (expected true|false)" >&2
  exit 1
fi
echo "billing mode locked: BILLING_ACTIONS_ENABLED=$BILLING_MODE"

echo ""
echo "5) optional full BYOK deploy smoke"
MISSING_FULL_SMOKE=()
for v in AUTH_VERIFY_TOKEN USER_SESSION_TOKEN PROJECT_ID PUBLIC_API_KEY; do
  if [[ -z "${!v:-}" ]]; then
    MISSING_FULL_SMOKE+=("$v")
  fi
done
if [[ ${#MISSING_FULL_SMOKE[@]} -eq 0 ]]; then
  RECODER_WEB_URL="$RECODER_WEB_URL" bash "$SCRIPT_DIR/smoke-byok-internal-auth.sh"
else
  echo "skipping full BYOK smoke (missing env: ${MISSING_FULL_SMOKE[*]})"
  echo "run later with those vars set to complete the final blocker."
fi

echo ""
echo "== Section 2 smoke complete =="
