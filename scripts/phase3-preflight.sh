#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PHASE3_MODE="${PHASE3_MODE:-production}"
SKIP_ENV_GATES="${SKIP_ENV_GATES:-false}"
DRY_RUN="${DRY_RUN:-false}"
ENABLE_A2A_INTEROP_SMOKE="${ENABLE_A2A_INTEROP_SMOKE:-true}"
RECODER_WEB_URL="${RECODER_WEB_URL:-https://web.recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
BASE_URL="${BASE_URL:-https://recoder.xyz}"
WORKER_ENV_FILE="${A2A_WORKER_ENV_FILE:-$REPO_ROOT/.env.a2a.workers}"
PRODUCTION_SCOPE="${PRODUCTION_SCOPE:-core}"

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true|false) echo "$(echo "$1" | tr '[:upper:]' '[:lower:]')" ;;
    *) echo "invalid" ;;
  esac
}

validate_bool() {
  local key="$1"
  local raw="$2"
  local val
  val="$(normalize_bool "$raw")"
  if [[ "$val" == "invalid" ]]; then
    echo "Invalid $key='$raw' (expected true|false)." >&2
    exit 1
  fi
  echo "$val"
}

SKIP_ENV_GATES="$(validate_bool SKIP_ENV_GATES "$SKIP_ENV_GATES")"
DRY_RUN="$(validate_bool DRY_RUN "$DRY_RUN")"
ENABLE_A2A_INTEROP_SMOKE="$(validate_bool ENABLE_A2A_INTEROP_SMOKE "$ENABLE_A2A_INTEROP_SMOKE")"

FAILURES=0

read_env_file_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#export }"
  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

echo "== Phase 3 Preflight =="
echo "mode=$PHASE3_MODE dry_run=$DRY_RUN skip_env_gates=$SKIP_ENV_GATES a2a_smoke=$ENABLE_A2A_INTEROP_SMOKE"
echo "scope=$PRODUCTION_SCOPE"

if [[ "$PHASE3_MODE" == "production" && "$SKIP_ENV_GATES" == "false" ]]; then
  echo ""
  echo "[1/3] Environment gate precheck"
  if env PRODUCTION_SCOPE="$PRODUCTION_SCOPE" pnpm -C "$REPO_ROOT" run check:prod-env-gate; then
    echo "env precheck: PASS"
  else
    echo "env precheck: FAIL" >&2
    pnpm -C "$REPO_ROOT" run check:prod-env-missing || true
    ((FAILURES+=1))
  fi
else
  echo ""
  echo "[1/3] Environment gate precheck: SKIP (mode/flags)"
fi

if [[ "$DRY_RUN" == "false" ]]; then
  echo ""
  echo "[2/3] Network reachability precheck"
  for url in "$RECODER_WEB_URL" "$BACKEND_URL" "$BASE_URL"; do
    code="$(curl -s --connect-timeout 5 --max-time 15 -o /tmp/phase3_preflight.out -w "%{http_code}" "$url" || true)"
    [[ -z "$code" ]] && code="000"
    echo "- $url -> $code"
    if [[ "$code" == "000" ]]; then
      ((FAILURES+=1))
    fi
  done
else
  echo ""
  echo "[2/3] Network reachability precheck: SKIP (DRY_RUN=true)"
fi

if [[ "$ENABLE_A2A_INTEROP_SMOKE" == "true" ]]; then
  echo ""
  echo "[3/3] A2A secret precheck"
  a2a_secret="${RECODER_A2A_SHARED_SECRET:-}"
  if [[ -z "$a2a_secret" ]]; then
    a2a_secret="$(read_env_file_value "$WORKER_ENV_FILE" "RECODER_A2A_SHARED_SECRET" || true)"
  fi
  if [[ -n "$a2a_secret" && ! "$a2a_secret" =~ replace_with|changeme|example|todo ]]; then
    echo "RECODER_A2A_SHARED_SECRET: set"
  else
    echo "RECODER_A2A_SHARED_SECRET: missing" >&2
    echo "hint: export RECODER_A2A_SHARED_SECRET or set it in $WORKER_ENV_FILE" >&2
    ((FAILURES+=1))
  fi

  smoke_endpoint="${RECODER_A2A_SMOKE_ENDPOINT:-}"
  codex_endpoint="${RECODER_A2A_CODEX_ENDPOINT:-}"
  claude_endpoint="${RECODER_A2A_CLAUDE_ENDPOINT:-}"
  backend_base="${DOCKER_BACKEND_INTERNAL_URL:-${BACKEND_URL:-}}"
  if [[ -z "$smoke_endpoint" && ( -z "$codex_endpoint" || -z "$claude_endpoint" ) ]]; then
    if [[ -n "$backend_base" ]]; then
      echo "A2A smoke endpoint fallback: ${backend_base%/}/api/a2a/envelope"
    else
      echo "A2A smoke endpoint not configured (set RECODER_A2A_SMOKE_ENDPOINT or both RECODER_A2A_CODEX_ENDPOINT/RECODER_A2A_CLAUDE_ENDPOINT)." >&2
      ((FAILURES+=1))
    fi
  fi
else
  echo ""
  echo "[3/3] A2A secret precheck: SKIP (ENABLE_A2A_INTEROP_SMOKE=false)"
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo ""
  echo "phase3 preflight: FAIL ($FAILURES issue(s))" >&2
  exit 1
fi

echo ""
echo "phase3 preflight: PASS"
