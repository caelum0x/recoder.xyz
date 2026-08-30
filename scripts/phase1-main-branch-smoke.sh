#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_URL="${BACKEND_URL:-https://docker.recoder.xyz}"
EXPECTED_QUEUE_BACKEND="${EXPECTED_QUEUE_BACKEND:-redis}"
BILLING_ACTIONS_ENABLED_RAW="${BILLING_ACTIONS_ENABLED:-}"
DRY_RUN="${DRY_RUN:-false}"

usage() {
  cat <<'EOF'
Phase 1 main-branch smoke wrapper.

Runs:
1) local environment consistency
2) backend queue readiness (redis expected by default)
3) billing-mode decision validation

Environment:
  BACKEND_URL                 default: https://docker.recoder.xyz
  EXPECTED_QUEUE_BACKEND      default: redis
  BILLING_ACTIONS_ENABLED     required: true|false
  DRY_RUN                     optional: true|false

Example:
  BILLING_ACTIONS_ENABLED=false pnpm run smoke:phase1
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$BILLING_ACTIONS_ENABLED_RAW" ]]; then
  echo "BILLING_ACTIONS_ENABLED is required (set to true or false)." >&2
  exit 1
fi

BILLING_ACTIONS_ENABLED="$(echo "$BILLING_ACTIONS_ENABLED_RAW" | tr '[:upper:]' '[:lower:]')"
if [[ "$BILLING_ACTIONS_ENABLED" != "true" && "$BILLING_ACTIONS_ENABLED" != "false" ]]; then
  echo "Invalid BILLING_ACTIONS_ENABLED='$BILLING_ACTIONS_ENABLED_RAW' (expected true|false)." >&2
  exit 1
fi

echo "== Phase 1 Main-Branch Smoke =="
echo "backend: $BACKEND_URL"
echo "expectedQueueBackend: $EXPECTED_QUEUE_BACKEND"
echo "billingActionsEnabled: $BILLING_ACTIONS_ENABLED"

echo ""
echo "0) local env consistency preflight"
BILLING_ACTIONS_ENABLED="$BILLING_ACTIONS_ENABLED" \
  bash "$REPO_ROOT/scripts/check-phase1-env-consistency.sh"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY_RUN=true, skipping network checks."
  exit 0
fi

BACKEND_URL="$BACKEND_URL" \
EXPECTED_QUEUE_BACKEND="$EXPECTED_QUEUE_BACKEND" \
pnpm -C "$REPO_ROOT/backend" run smoke:queue

echo "Phase 1 smoke passed."
