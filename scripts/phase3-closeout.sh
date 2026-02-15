#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PHASE3_MODE="${PHASE3_MODE:-production}"
DRY_RUN="${DRY_RUN:-false}"
SKIP_ENV_GATES="${SKIP_ENV_GATES:-false}"
SKIP_TYPECHECK_GATES="${SKIP_TYPECHECK_GATES:-false}"
ENABLE_A2A_INTEROP_SMOKE="${ENABLE_A2A_INTEROP_SMOKE:-true}"
A2A_WORKER_STATUS_CHECK="${A2A_WORKER_STATUS_CHECK:-true}"
BILLING_ACTIONS_ENABLED="${BILLING_ACTIONS_ENABLED:-false}"
RECODER_WEB_URL="${RECODER_WEB_URL:-https://web.recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
BASE_URL="${BASE_URL:-https://recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"
ASSERT_GA_READY="${ASSERT_GA_READY:-true}"
ALLOW_NON_GA="${ALLOW_NON_GA:-false}"
RUN_PREFLIGHT="${RUN_PREFLIGHT:-true}"

usage() {
  cat <<'USAGE'
Usage: phase3-closeout.sh

Runs full local Phase 3 closeout sequence:
1) phase3:gates
2) phase3:assert-ga-ready (strict by default)
3) phase3:evidence-pack

Key env toggles:
  ASSERT_GA_READY=true|false      default: true
  ALLOW_NON_GA=true|false         default: false

Examples:
  pnpm run phase3:closeout

  PHASE3_MODE=local-dev DRY_RUN=true SKIP_ENV_GATES=true SKIP_TYPECHECK_GATES=true \
  ENABLE_A2A_INTEROP_SMOKE=false A2A_WORKER_STATUS_CHECK=false \
  ASSERT_GA_READY=false ALLOW_NON_GA=true pnpm run phase3:closeout
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true|false) echo "$(echo "$1" | tr '[:upper:]' '[:lower:]')" ;;
    *) echo "invalid" ;;
  esac
}

validate_bool() {
  local k="$1"
  local raw="$2"
  local val
  val="$(normalize_bool "$raw")"
  if [[ "$val" == "invalid" ]]; then
    echo "Invalid $k='$raw' (expected true|false)." >&2
    exit 1
  fi
  echo "$val"
}

DRY_RUN="$(validate_bool DRY_RUN "$DRY_RUN")"
SKIP_ENV_GATES="$(validate_bool SKIP_ENV_GATES "$SKIP_ENV_GATES")"
SKIP_TYPECHECK_GATES="$(validate_bool SKIP_TYPECHECK_GATES "$SKIP_TYPECHECK_GATES")"
ENABLE_A2A_INTEROP_SMOKE="$(validate_bool ENABLE_A2A_INTEROP_SMOKE "$ENABLE_A2A_INTEROP_SMOKE")"
A2A_WORKER_STATUS_CHECK="$(validate_bool A2A_WORKER_STATUS_CHECK "$A2A_WORKER_STATUS_CHECK")"
BILLING_ACTIONS_ENABLED="$(validate_bool BILLING_ACTIONS_ENABLED "$BILLING_ACTIONS_ENABLED")"
ASSERT_GA_READY="$(validate_bool ASSERT_GA_READY "$ASSERT_GA_READY")"
ALLOW_NON_GA="$(validate_bool ALLOW_NON_GA "$ALLOW_NON_GA")"
RUN_PREFLIGHT="$(validate_bool RUN_PREFLIGHT "$RUN_PREFLIGHT")"

echo "== Phase 3 Closeout =="
echo "mode=$PHASE3_MODE dry_run=$DRY_RUN skip_env=$SKIP_ENV_GATES skip_typecheck=$SKIP_TYPECHECK_GATES"
echo "a2a_interop=$ENABLE_A2A_INTEROP_SMOKE a2a_worker_status=$A2A_WORKER_STATUS_CHECK"
echo "assert_ga_ready=$ASSERT_GA_READY allow_non_ga=$ALLOW_NON_GA"
echo "run_preflight=$RUN_PREFLIGHT"

if [[ "$RUN_PREFLIGHT" == "true" ]]; then
  env \
    PHASE3_MODE="$PHASE3_MODE" \
    DRY_RUN="$DRY_RUN" \
    SKIP_ENV_GATES="$SKIP_ENV_GATES" \
    ENABLE_A2A_INTEROP_SMOKE="$ENABLE_A2A_INTEROP_SMOKE" \
    RECODER_WEB_URL="$RECODER_WEB_URL" \
    BACKEND_URL="$BACKEND_URL" \
    BASE_URL="$BASE_URL" \
    bash "$REPO_ROOT/scripts/phase3-preflight.sh"
fi

env \
  PHASE3_MODE="$PHASE3_MODE" \
  DRY_RUN="$DRY_RUN" \
  SKIP_ENV_GATES="$SKIP_ENV_GATES" \
  SKIP_TYPECHECK_GATES="$SKIP_TYPECHECK_GATES" \
  ENABLE_A2A_INTEROP_SMOKE="$ENABLE_A2A_INTEROP_SMOKE" \
  A2A_WORKER_STATUS_CHECK="$A2A_WORKER_STATUS_CHECK" \
  BILLING_ACTIONS_ENABLED="$BILLING_ACTIONS_ENABLED" \
  RECODER_WEB_URL="$RECODER_WEB_URL" \
  BACKEND_URL="$BACKEND_URL" \
  BASE_URL="$BASE_URL" \
  EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" \
  pnpm -C "$REPO_ROOT" run phase3:gates

if [[ "$ASSERT_GA_READY" == "true" ]]; then
  env PHASE3_ALLOW_NON_GA="$ALLOW_NON_GA" pnpm -C "$REPO_ROOT" run phase3:assert-ga-ready
else
  echo "Skipping strict GA assertion (ASSERT_GA_READY=false)."
fi

pnpm -C "$REPO_ROOT" run phase3:evidence-pack

echo "Phase 3 closeout complete."
