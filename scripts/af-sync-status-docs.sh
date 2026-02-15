#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HANDOFF_DIR="$REPO_ROOT/logs/af-networked/handoff"
CURRENT_STATUS="$REPO_ROOT/CURRENT_STATUS.md"
REMAINING="$REPO_ROOT/REMAINING.md"

SUMMARY_MD="${1:-}"
if [[ -z "$SUMMARY_MD" ]]; then
  SUMMARY_MD="$(ls -1t "$HANDOFF_DIR"/*-summary.md 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$SUMMARY_MD" || ! -f "$SUMMARY_MD" ]]; then
  echo "No summary markdown found to sync docs." >&2
  exit 1
fi

SUMMARY_JSON="${SUMMARY_MD%.md}.json"

generated="$(grep -E '^- Generated \(UTC\): ' "$SUMMARY_MD" | head -n 1 | sed 's/^- Generated (UTC): //')"
run_status="$(grep -E '^- AF run status in this invocation: ' "$SUMMARY_MD" | head -n 1 | sed 's/^- AF run status in this invocation: //')"
billing_mode="$(grep -E '^- Billing mode: ' "$SUMMARY_MD" | head -n 1 | sed 's/^- Billing mode: //')"
source_log="$(grep -E '^- Source AF log: ' "$SUMMARY_MD" | head -n 1 | sed 's/^- Source AF log: //; s/^`//; s/`$//')"
overall="$(grep -E '^- Overall: ' "$SUMMARY_MD" | head -n 1 | sed 's/^- Overall: //')"

fail_steps="$(
  awk '
    /^## Failing Steps$/ { sec=1; next }
    /^## Next Commands$/ { sec=0 }
    sec && /^- / { print }
  ' "$SUMMARY_MD"
)"

next_cmds="$(
  awk '
    /^## Next Commands$/ { sec=1; next }
    /^## Artifacts$/ { sec=0 }
    sec && /^[0-9]+\./ { print }
  ' "$SUMMARY_MD"
)"

strip_block() {
  local file="$1"
  local start="$2"
  local end="$3"
  awk -v s="$start" -v e="$end" '
    $0 == s { skip=1; next }
    $0 == e { skip=0; next }
    !skip { print }
  ' "$file"
}

update_file_with_block() {
  local file="$1"
  local start="$2"
  local end="$3"
  local block_file="$4"
  local tmp
  tmp="$(mktemp)"
  strip_block "$file" "$start" "$end" > "$tmp"
  {
    cat "$tmp"
    echo ""
    cat "$block_file"
  } > "$file"
  rm -f "$tmp"
}

status_block="$(mktemp)"
{
  echo "<!-- AF_AUTO_STATUS_START -->"
  echo "### AF Auto Sync (latest)"
  echo ""
  echo "- Generated (UTC): $generated"
  echo "- AF run status: $run_status"
  echo "- Billing mode: $billing_mode"
  echo "- Overall: $overall"
  echo "- Source AF log: \`$source_log\`"
  echo "- Handoff markdown: \`$SUMMARY_MD\`"
  if [[ -f "$SUMMARY_JSON" ]]; then
    echo "- Handoff json: \`$SUMMARY_JSON\`"
  fi
  echo ""
  echo "Failing steps:"
  if [[ -n "$fail_steps" ]]; then
    echo "$fail_steps"
  else
    echo "- None"
  fi
  echo "<!-- AF_AUTO_STATUS_END -->"
} > "$status_block"

remaining_block="$(mktemp)"
{
  echo "<!-- AF_AUTO_REMAINING_START -->"
  echo "## AF Auto Remaining (latest)"
  echo ""
  echo "- Generated (UTC): $generated"
  echo "- Overall: $overall"
  echo ""
  echo "Outstanding failing steps:"
  if [[ -n "$fail_steps" ]]; then
    echo "$fail_steps"
  else
    echo "- None"
  fi
  echo ""
  echo "Next commands:"
  if [[ -n "$next_cmds" ]]; then
    echo "$next_cmds"
  else
    echo "1. \`pnpm run af:preflight\`"
    echo "2. \`BILLING_ACTIONS_ENABLED=false pnpm run af:networked\`"
  fi
  echo "<!-- AF_AUTO_REMAINING_END -->"
} > "$remaining_block"

update_file_with_block "$CURRENT_STATUS" "<!-- AF_AUTO_STATUS_START -->" "<!-- AF_AUTO_STATUS_END -->" "$status_block"
update_file_with_block "$REMAINING" "<!-- AF_AUTO_REMAINING_START -->" "<!-- AF_AUTO_REMAINING_END -->" "$remaining_block"

rm -f "$status_block" "$remaining_block"

echo "Updated docs from AF summary:"
echo "- $CURRENT_STATUS"
echo "- $REMAINING"
