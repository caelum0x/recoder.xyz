#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env: $name" >&2
    exit 1
  fi
}

extract_json_field() {
  local file="$1"
  local path="$2"
  node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const path = process.argv[2].split('.');
let cur = data;
for (const p of path) {
  if (cur == null) break;
  cur = cur[p];
}
if (cur === undefined || cur === null) process.exit(2);
if (typeof cur === 'object') console.log(JSON.stringify(cur));
else console.log(String(cur));
" "$file" "$path"
}

normalize_session_token() {
  local value="$1"
  value="${value#Bearer }"
  value="${value#bearer }"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"

  local cookie_names=(
    "__Secure-recoder.session_token"
    "recoder.session_token"
    "__Secure-session_token"
    "session_token"
    "recoder_session_token"
  )
  for name in "${cookie_names[@]}"; do
    local prefix="${name}="
    if [[ "$value" == "$prefix"* ]]; then
      value="${value#${prefix}}"
      break
    fi
  done

  value="${value%%;*}"
  printf '%s' "$value"
}

echo "== Recoder Deploy Smoke (BYOK + Internal Auth) =="

require_env "RECODER_WEB_URL"
require_env "AUTH_VERIFY_TOKEN"
require_env "PROJECT_ID"
require_env "PUBLIC_API_KEY"
require_env "USER_SESSION_TOKEN"

if [[ "${AUTH_VERIFY_TOKEN}" == "..." || "${USER_SESSION_TOKEN}" == "..." ]]; then
  echo "AUTH_VERIFY_TOKEN/USER_SESSION_TOKEN cannot be placeholder values (\"...\")" >&2
  exit 1
fi

SESSION_COOKIE_NAME="${SESSION_COOKIE_NAME:-recoder.session_token}"
TASK_POLL_ATTEMPTS="${TASK_POLL_ATTEMPTS:-20}"
TASK_POLL_SLEEP_SECONDS="${TASK_POLL_SLEEP_SECONDS:-2}"
PROMPT_TEXT="${PROMPT_TEXT:-Create a tiny hello-world update and report done.}"
MODEL_NAME="${MODEL_NAME:-openai/gpt-4o-mini}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

MAIN_SITE_URL="${MAIN_SITE_URL:-https://recoder.xyz}"
USER_SESSION_TOKEN_NORMALIZED="$(normalize_session_token "${USER_SESSION_TOKEN}")"
AUTH_VERIFY_TOKEN_NORMALIZED="$(normalize_session_token "${AUTH_VERIFY_TOKEN}")"
if [[ -z "$AUTH_VERIFY_TOKEN_NORMALIZED" ]]; then
  AUTH_VERIFY_TOKEN_NORMALIZED="$USER_SESSION_TOKEN_NORMALIZED"
fi
if [[ -z "$USER_SESSION_TOKEN_NORMALIZED" || -z "$AUTH_VERIFY_TOKEN_NORMALIZED" ]]; then
  echo "Normalized tokens are empty. Provide raw session token or cookie-pair format (name=value)." >&2
  exit 1
fi

COOKIE_HEADER="Cookie: ${SESSION_COOKIE_NAME}=${USER_SESSION_TOKEN_NORMALIZED}"
AUTH_VERIFY_TOKEN_ENCODED="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$AUTH_VERIFY_TOKEN_NORMALIZED")"

if [[ -n "${INTERNAL_SERVICE_KEY:-}" ]]; then
  echo "0) Pre-flight: direct token validation against app ($MAIN_SITE_URL) with signed internal auth ..."
  PREFLIGHT_BODY="$WORKDIR/preflight.json"
  PREFLIGHT_SIGNED="$(
    node -e "
const crypto = require('crypto');
const token = process.argv[1];
const key = process.argv[2];
const pathname = '/api/auth/verify-token';
const body = JSON.stringify({ token });
const timestamp = String(Date.now());
const nonce = crypto.randomUUID();
const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
const payload = [timestamp, nonce, 'POST', pathname, bodyHash].join('.');
const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');
process.stdout.write(JSON.stringify({ body, timestamp, nonce, signature }));
" "$USER_SESSION_TOKEN_NORMALIZED" "$INTERNAL_SERVICE_KEY"
  )"

  PREFLIGHT_REQ_BODY="$(node -e "console.log(JSON.parse(process.argv[1]).body)" "$PREFLIGHT_SIGNED")"
  PREFLIGHT_TS="$(node -e "console.log(JSON.parse(process.argv[1]).timestamp)" "$PREFLIGHT_SIGNED")"
  PREFLIGHT_NONCE="$(node -e "console.log(JSON.parse(process.argv[1]).nonce)" "$PREFLIGHT_SIGNED")"
  PREFLIGHT_SIG="$(node -e "console.log(JSON.parse(process.argv[1]).signature)" "$PREFLIGHT_SIGNED")"

  PREFLIGHT_STATUS=$(curl -sS -o "$PREFLIGHT_BODY" -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-internal-service-key: ${INTERNAL_SERVICE_KEY}" \
    -H "x-internal-timestamp: ${PREFLIGHT_TS}" \
    -H "x-internal-nonce: ${PREFLIGHT_NONCE}" \
    -H "x-internal-signature: ${PREFLIGHT_SIG}" \
    -d "${PREFLIGHT_REQ_BODY}" \
    "${MAIN_SITE_URL%/}/api/auth/verify-token" 2>&1) || PREFLIGHT_STATUS="000"

  echo "   app verify-token HTTP $PREFLIGHT_STATUS"
  if [[ "$PREFLIGHT_STATUS" == "000" ]]; then
    echo "   FATAL: cannot reach app at ${MAIN_SITE_URL}" >&2
    exit 1
  fi
  if [[ "$PREFLIGHT_STATUS" -ge 400 ]]; then
    echo "   app rejected token preflight (HTTP $PREFLIGHT_STATUS):" >&2
    cat "$PREFLIGHT_BODY" >&2
    echo "" >&2
    echo "   -> If reason is invalid_signature/invalid_service_key_header: local INTERNAL_SERVICE_KEY is wrong for deployed app" >&2
    echo "   -> If 'Invalid or expired token': USER_SESSION_TOKEN is stale; copy a fresh browser cookie token" >&2
    exit 1
  fi
  echo "   token valid — $(cat "$PREFLIGHT_BODY")"
else
  echo "0) Pre-flight against app skipped (INTERNAL_SERVICE_KEY not set locally)."
fi

echo "1) Verify internal auth bridge via /auth/verify ..."
AUTH_HEADERS_FILE="$WORKDIR/auth.headers"
AUTH_BODY_FILE="$WORKDIR/auth.body.json"
curl -sS -D "$AUTH_HEADERS_FILE" \
  -H "$COOKIE_HEADER" \
  "${RECODER_WEB_URL%/}/auth/verify?token=${AUTH_VERIFY_TOKEN_ENCODED}" \
  > "$AUTH_BODY_FILE"

AUTH_STATUS="$(head -n 1 "$AUTH_HEADERS_FILE" | awk '{print $2}')"
if [[ "$AUTH_STATUS" -lt 200 || "$AUTH_STATUS" -ge 400 ]]; then
  echo "auth.verify failed with HTTP $AUTH_STATUS" >&2
  echo "--- response headers ---" >&2
  cat "$AUTH_HEADERS_FILE" >&2
  echo "--- response body ---" >&2
  cat "$AUTH_BODY_FILE" >&2
  echo "" >&2
  echo "--- parsed diagnostics (if JSON) ---" >&2
  UPSTREAM_STATUS="$(extract_json_field "$AUTH_BODY_FILE" "upstreamStatus" 2>/dev/null || true)"
  UPSTREAM_ERROR="$(extract_json_field "$AUTH_BODY_FILE" "upstreamError" 2>/dev/null || true)"
  UPSTREAM_REASON="$(extract_json_field "$AUTH_BODY_FILE" "upstreamReason" 2>/dev/null || true)"
  AUTH_ERROR="$(extract_json_field "$AUTH_BODY_FILE" "error" 2>/dev/null || true)"
  AUTH_REASON="$(extract_json_field "$AUTH_BODY_FILE" "reason" 2>/dev/null || true)"
  if [[ -n "$AUTH_ERROR" ]]; then
    echo "error: $AUTH_ERROR" >&2
  fi
  if [[ -n "$UPSTREAM_STATUS" ]]; then
    echo "upstreamStatus: $UPSTREAM_STATUS" >&2
  fi
  if [[ -n "$UPSTREAM_ERROR" ]]; then
    echo "upstreamError: $UPSTREAM_ERROR" >&2
  fi
  if [[ -n "$UPSTREAM_REASON" ]]; then
    echo "upstreamReason: $UPSTREAM_REASON" >&2
  fi
  if [[ -n "$AUTH_REASON" ]]; then
    echo "reason: $AUTH_REASON" >&2
  fi
  echo "hints:" >&2
  echo "- Invalid or expired token => session cookie is stale; copy fresh browser cookie." >&2
  echo "- Unauthorized + reason invalid_signature/invalid_service_key_header => INTERNAL_SERVICE_KEY mismatch between recoder-web and app." >&2
  echo "- timestamp_out_of_range => server clock skew between services." >&2
  echo "" >&2
  exit 1
fi
echo "   ok (HTTP $AUTH_STATUS)"

echo "1b) Verify /auth/verify with Authorization bearer (no query token) ..."
AUTH_BEARER_HEADERS="$WORKDIR/auth-bearer.headers"
AUTH_BEARER_BODY="$WORKDIR/auth-bearer.body.json"
curl -sS -D "$AUTH_BEARER_HEADERS" \
  -H "$COOKIE_HEADER" \
  -H "Authorization: Bearer ${AUTH_VERIFY_TOKEN_NORMALIZED}" \
  "${RECODER_WEB_URL%/}/auth/verify" \
  > "$AUTH_BEARER_BODY"

AUTH_BEARER_STATUS="$(head -n 1 "$AUTH_BEARER_HEADERS" | awk '{print $2}')"
if [[ "$AUTH_BEARER_STATUS" -lt 200 || "$AUTH_BEARER_STATUS" -ge 400 ]]; then
  echo "auth.verify (bearer) failed with HTTP $AUTH_BEARER_STATUS" >&2
  echo "--- response headers ---" >&2
  cat "$AUTH_BEARER_HEADERS" >&2
  echo "--- response body ---" >&2
  cat "$AUTH_BEARER_BODY" >&2
  exit 1
fi
echo "   bearer ok (HTTP $AUTH_BEARER_STATUS)"

echo "2) Enqueue public prompt task ..."
PROMPT_BODY="$WORKDIR/prompt-body.json"
PROMPT_HEADERS="$WORKDIR/prompt-headers.txt"
cat > "$PROMPT_BODY" <<JSON
{"projectId":"${PROJECT_ID}","prompt":"${PROMPT_TEXT}","apiKey":"${PUBLIC_API_KEY}","model":"${MODEL_NAME}"}
JSON

PROMPT_RESPONSE="$WORKDIR/prompt-response.json"
curl -sS -D "$PROMPT_HEADERS" \
  -H "Content-Type: application/json" \
  -H "$COOKIE_HEADER" \
  -X POST \
  --data-binary "@$PROMPT_BODY" \
  "${RECODER_WEB_URL%/}/api/public/projects/prompt" \
  > "$PROMPT_RESPONSE"

PROMPT_STATUS="$(head -n 1 "$PROMPT_HEADERS" | awk '{print $2}')"
if [[ "$PROMPT_STATUS" -lt 200 || "$PROMPT_STATUS" -ge 300 ]]; then
  echo "prompt enqueue failed with HTTP $PROMPT_STATUS" >&2
  cat "$PROMPT_RESPONSE" >&2
  exit 1
fi

TASK_ID="$(
  extract_json_field "$PROMPT_RESPONSE" "data.taskId" 2>/dev/null \
  || extract_json_field "$PROMPT_RESPONSE" "taskId"
)"
if [[ -z "$TASK_ID" ]]; then
  echo "taskId not found in prompt response" >&2
  cat "$PROMPT_RESPONSE" >&2
  exit 1
fi
echo "   taskId=$TASK_ID"

echo "3) Poll task status ..."
FINAL_STATUS=""
for ((i=1; i<=TASK_POLL_ATTEMPTS; i++)); do
  TASK_RESPONSE="$WORKDIR/task-response.json"
  TASK_HEADERS="$WORKDIR/task-headers.txt"
  curl -sS -D "$TASK_HEADERS" \
    -H "$COOKIE_HEADER" \
    "${RECODER_WEB_URL%/}/api/public/projects/task?projectId=${PROJECT_ID}&taskId=${TASK_ID}" \
    > "$TASK_RESPONSE"

  TASK_HTTP="$(head -n 1 "$TASK_HEADERS" | awk '{print $2}')"
  if [[ "$TASK_HTTP" -lt 200 || "$TASK_HTTP" -ge 300 ]]; then
    echo "task poll failed with HTTP $TASK_HTTP" >&2
    cat "$TASK_RESPONSE" >&2
    exit 1
  fi

  STATUS="$(
    extract_json_field "$TASK_RESPONSE" "data.task.status" 2>/dev/null \
    || extract_json_field "$TASK_RESPONSE" "data.status" 2>/dev/null \
    || extract_json_field "$TASK_RESPONSE" "status" 2>/dev/null \
    || true
  )"
  echo "   poll[$i]: status=${STATUS:-unknown}"

  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" || "$STATUS" == "cancelled" ]]; then
    FINAL_STATUS="$STATUS"
    break
  fi
  sleep "$TASK_POLL_SLEEP_SECONDS"
done

if [[ -z "$FINAL_STATUS" ]]; then
  echo "task did not reach terminal status in allotted polls" >&2
  exit 1
fi
echo "   terminal status: $FINAL_STATUS"

echo "4) Probe task stream endpoint ..."
STREAM_FILE="$WORKDIR/task-stream.txt"
curl -sS --max-time 15 \
  -H "$COOKIE_HEADER" \
  "${RECODER_WEB_URL%/}/api/public/projects/task-stream?projectId=${PROJECT_ID}&taskId=${TASK_ID}" \
  > "$STREAM_FILE" || true

if ! grep -qE "event:|data:" "$STREAM_FILE"; then
  echo "task stream probe did not return SSE frames" >&2
  cat "$STREAM_FILE" >&2
  exit 1
fi

echo "   stream frames received"
echo "== Smoke passed =="
