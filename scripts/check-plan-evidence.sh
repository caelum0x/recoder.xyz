#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAN_FILE="${PLAN_FILE:-$REPO_ROOT/plan.md}"

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "plan file not found: $PLAN_FILE" >&2
  exit 1
fi

tmp_section="$(mktemp)"
trap 'rm -f "$tmp_section"' EXIT

awk '
  /^## 8\) Active Task Board/ { in_section=1; next }
  /^## / && in_section==1 { in_section=0 }
  in_section==1 { print }
' "$PLAN_FILE" > "$tmp_section"

if [[ ! -s "$tmp_section" ]]; then
  echo "could not parse section 8 from $PLAN_FILE" >&2
  exit 1
fi

missing=0
current_task=""
current_done=0
current_has_evidence=0

flush_task() {
  if [[ "$current_done" -eq 1 && "$current_has_evidence" -eq 0 && -n "$current_task" ]]; then
    echo "missing evidence: $current_task"
    missing=$((missing+1))
  fi
}

while IFS= read -r line; do
  if [[ "$line" =~ ^-\ \`P[0-9]-A[0-9]-[0-9]{3}\` ]]; then
    flush_task
    current_task="$line"
    current_done=0
    current_has_evidence=0
    continue
  fi

  if [[ "$line" == *"Status: \`done\`"* ]]; then
    current_done=1
    continue
  fi

  if [[ "$line" == *"Evidence:"* ]]; then
    current_has_evidence=1
    continue
  fi
done < "$tmp_section"

flush_task

if [[ "$missing" -gt 0 ]]; then
  echo "plan evidence check: FAIL ($missing done task(s) missing evidence)"
  exit 1
fi

echo "plan evidence check: PASS"
