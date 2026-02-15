#!/usr/bin/env bash
set -euo pipefail

WORKFLOW_FILE=".github/workflows/phase3-release-signoff.yml"
REPO="${REPO:-caelum0x/recoder.xyz}"

PHASE3_MODE="${PHASE3_MODE:-production}"
DRY_RUN="${DRY_RUN:-false}"
SKIP_ENV_GATES="${SKIP_ENV_GATES:-false}"
SKIP_TYPECHECK_GATES="${SKIP_TYPECHECK_GATES:-false}"
ENABLE_A2A_INTEROP_SMOKE="${ENABLE_A2A_INTEROP_SMOKE:-true}"
A2A_WORKER_STATUS_CHECK="${A2A_WORKER_STATUS_CHECK:-true}"
ALLOW_NON_GA="${ALLOW_NON_GA:-false}"
BILLING_ACTIONS_ENABLED="${BILLING_ACTIONS_ENABLED:-false}"
RECODER_WEB_URL="${RECODER_WEB_URL:-https://web.recoder.xyz}"
BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
BASE_URL="${BASE_URL:-https://recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"
WATCH_RUN="${WATCH_RUN:-true}"

usage() {
  cat <<'USAGE'
Dispatches GitHub workflow: Phase 3 Release Signoff

Environment overrides:
  PHASE3_MODE=production|local-dev
  DRY_RUN=true|false
  SKIP_ENV_GATES=true|false
  SKIP_TYPECHECK_GATES=true|false
  ENABLE_A2A_INTEROP_SMOKE=true|false
  A2A_WORKER_STATUS_CHECK=true|false
  ALLOW_NON_GA=true|false
  BILLING_ACTIONS_ENABLED=true|false
  RECODER_WEB_URL=<url>
  BACKEND_URL=<url>
  BASE_URL=<url>
  EXPECTED_QUEUE_BACKEND=redis|in-memory
  WATCH_RUN=true|false

Examples:
  pnpm run phase3:dispatch-signoff

  DRY_RUN=true SKIP_ENV_GATES=true SKIP_TYPECHECK_GATES=true ALLOW_NON_GA=true \
    pnpm run phase3:dispatch-signoff
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
  local val
  val="$(normalize_bool "$2")"
  if [[ "$val" == "invalid" ]]; then
    echo "Invalid $1='$2' (expected true|false)." >&2
    exit 1
  fi
  echo "$val"
}

DRY_RUN="$(validate_bool DRY_RUN "$DRY_RUN")"
SKIP_ENV_GATES="$(validate_bool SKIP_ENV_GATES "$SKIP_ENV_GATES")"
SKIP_TYPECHECK_GATES="$(validate_bool SKIP_TYPECHECK_GATES "$SKIP_TYPECHECK_GATES")"
ENABLE_A2A_INTEROP_SMOKE="$(validate_bool ENABLE_A2A_INTEROP_SMOKE "$ENABLE_A2A_INTEROP_SMOKE")"
A2A_WORKER_STATUS_CHECK="$(validate_bool A2A_WORKER_STATUS_CHECK "$A2A_WORKER_STATUS_CHECK")"
ALLOW_NON_GA="$(validate_bool ALLOW_NON_GA "$ALLOW_NON_GA")"
BILLING_ACTIONS_ENABLED="$(validate_bool BILLING_ACTIONS_ENABLED "$BILLING_ACTIONS_ENABLED")"
WATCH_RUN="$(validate_bool WATCH_RUN "$WATCH_RUN")"

if ! gh auth status >/dev/null 2>&1; then
  if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
    echo "GitHub auth is not valid for gh CLI." >&2
    echo "Run: gh auth login -h github.com" >&2
    echo "or set GH_TOKEN/GITHUB_TOKEN for non-interactive dispatch." >&2
    exit 1
  fi
fi

if [[ ! -f "$WORKFLOW_FILE" ]]; then
  echo "Workflow file not found: $WORKFLOW_FILE" >&2
  exit 1
fi

echo "Dispatching Phase 3 Release Signoff workflow"
echo "repo: $REPO"
echo "workflow: $WORKFLOW_FILE"
echo "mode=$PHASE3_MODE dry_run=$DRY_RUN skip_env=$SKIP_ENV_GATES skip_typecheck=$SKIP_TYPECHECK_GATES"

gh api \
  -X POST \
  "repos/$REPO/actions/workflows/phase3-release-signoff.yml/dispatches" \
  -f ref="$(gh repo view "$REPO" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || echo main)" \
  -f inputs[phase3_mode]="$PHASE3_MODE" \
  -f inputs[dry_run]="$DRY_RUN" \
  -f inputs[skip_env_gates]="$SKIP_ENV_GATES" \
  -f inputs[skip_typecheck_gates]="$SKIP_TYPECHECK_GATES" \
  -f inputs[enable_a2a_interop_smoke]="$ENABLE_A2A_INTEROP_SMOKE" \
  -f inputs[a2a_worker_status_check]="$A2A_WORKER_STATUS_CHECK" \
  -f inputs[allow_non_ga]="$ALLOW_NON_GA" \
  -f inputs[billing_actions_enabled]="$BILLING_ACTIONS_ENABLED" \
  -f inputs[recoder_web_url]="$RECODER_WEB_URL" \
  -f inputs[backend_url]="$BACKEND_URL" \
  -f inputs[base_url]="$BASE_URL" \
  -f inputs[expected_queue_backend]="$EXPECTED_QUEUE_BACKEND"

sleep 2
run_id="$(gh run list -R "$REPO" --workflow "$WORKFLOW_FILE" --limit 1 --json databaseId --jq '.[0].databaseId')"
if [[ -n "$run_id" ]]; then
  echo "Dispatched run id: $run_id"
  echo "Run URL: https://github.com/$REPO/actions/runs/$run_id"
  if [[ "$WATCH_RUN" == "true" ]]; then
    gh run watch -R "$REPO" "$run_id" --exit-status
  fi
else
  echo "Workflow dispatched. Use 'gh run list -R $REPO --workflow $WORKFLOW_FILE --limit 5' to inspect." >&2
fi
