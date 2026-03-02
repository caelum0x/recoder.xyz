#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSERT_TIER2_PROMOTABLE="${ASSERT_TIER2_PROMOTABLE:-false}"
TIER2_PROMOTION_CONNECTOR="${TIER2_PROMOTION_CONNECTOR:-}"
TIER2_PROMOTION_TARGET="${TIER2_PROMOTION_TARGET:-}"

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true|false) echo "$(echo "$1" | tr '[:upper:]' '[:lower:]')" ;;
    *) echo "invalid" ;;
  esac
}

ASSERT_TIER2_PROMOTABLE="$(normalize_bool "$ASSERT_TIER2_PROMOTABLE")"
if [[ "$ASSERT_TIER2_PROMOTABLE" == "invalid" ]]; then
  echo "Invalid ASSERT_TIER2_PROMOTABLE='$ASSERT_TIER2_PROMOTABLE' (expected true|false)." >&2
  exit 1
fi

echo "== Tier-2 Promotion Gate =="
echo "assert_promotable=$ASSERT_TIER2_PROMOTABLE"

if [[ "$ASSERT_TIER2_PROMOTABLE" == "true" ]]; then
  node "$REPO_ROOT/tools/a2a-interop/js/validate-tier2-promotion.mjs" --all --assert-promotable
else
  node "$REPO_ROOT/tools/a2a-interop/js/validate-tier2-promotion.mjs" --all
fi

if [[ -n "$TIER2_PROMOTION_CONNECTOR" || -n "$TIER2_PROMOTION_TARGET" ]]; then
  if [[ -z "$TIER2_PROMOTION_CONNECTOR" || -z "$TIER2_PROMOTION_TARGET" ]]; then
    echo "Both TIER2_PROMOTION_CONNECTOR and TIER2_PROMOTION_TARGET must be set together." >&2
    exit 1
  fi
  echo "promotion_workflow_check=true connector=$TIER2_PROMOTION_CONNECTOR target=$TIER2_PROMOTION_TARGET"
  node "$REPO_ROOT/tools/a2a-interop/js/tier2-promotion-workflow.mjs" \
    validate \
    --connector "$TIER2_PROMOTION_CONNECTOR" \
    --to "$TIER2_PROMOTION_TARGET"
fi

echo "Tier-2 promotion gate passed."
