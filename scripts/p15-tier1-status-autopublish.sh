#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/logs/p15-tier1-status}"
LOG_FILE="$OUT_DIR/$RUN_ID.log"
SUMMARY_MD="$OUT_DIR/$RUN_ID-summary.md"
SUMMARY_JSON="$OUT_DIR/$RUN_ID-summary.json"
TARGET_FILE="${TARGET_FILE:-$REPO_ROOT/SUPPORTED_CONNECTORS.md}"
PHASE3_ARTIFACT="${PHASE3_ARTIFACT:-}"
RELEASE_ARTIFACT="${RELEASE_ARTIFACT:-}"
MODE="${1:-publish}" # publish | check | dry-run

mkdir -p "$OUT_DIR"

args=(
  "$REPO_ROOT/tools/a2a-interop/js/publish-tier1-support-status.mjs"
  --target
  "$TARGET_FILE"
  --json
)

if [[ -n "$PHASE3_ARTIFACT" ]]; then
  args+=(--phase3 "$PHASE3_ARTIFACT")
fi

if [[ -n "$RELEASE_ARTIFACT" ]]; then
  args+=(--release "$RELEASE_ARTIFACT")
fi

case "$MODE" in
  publish) ;;
  check) args+=(--check) ;;
  dry-run) args+=(--dry-run) ;;
  *)
    echo "Usage: $0 [publish|check|dry-run]" >&2
    exit 1
    ;;
esac

echo "== P15 Tier-1 support status auto-publish ==" | tee "$LOG_FILE"
echo "run_id: $RUN_ID" | tee -a "$LOG_FILE"
echo "mode: $MODE" | tee -a "$LOG_FILE"
echo "target: $TARGET_FILE" | tee -a "$LOG_FILE"

tmp_json="$(mktemp)"
set +e
node "${args[@]}" >"$tmp_json" 2>>"$LOG_FILE"
rc=$?
set -e

if [[ -s "$tmp_json" ]]; then
  cat "$tmp_json" | tee -a "$LOG_FILE" > "$SUMMARY_JSON"
else
  echo '{"ok":false,"error":"no-json-output"}' > "$SUMMARY_JSON"
fi
rm -f "$tmp_json"

summary="$(cat "$SUMMARY_JSON")"
changed="$(node -e "const x=JSON.parse(process.argv[1]); process.stdout.write(String(Boolean(x.changed)))" "$summary" 2>/dev/null || echo "false")"
source_name="$(node -e "const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.source||'unknown'))" "$summary" 2>/dev/null || echo "unknown")"
artifact_name="$(node -e "const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.artifact||'unknown'))" "$summary" 2>/dev/null || echo "unknown")"
ok_value="$(node -e "const x=JSON.parse(process.argv[1]); process.stdout.write(String(Boolean(x.ok)))" "$summary" 2>/dev/null || echo "false")"

{
  echo "# P15 Tier-1 Status Auto-Publish"
  echo
  echo "- Run ID: \`$RUN_ID\`"
  echo "- Mode: \`$MODE\`"
  echo "- Target: \`$TARGET_FILE\`"
  echo "- Source: \`$source_name\`"
  echo "- Artifact: \`$artifact_name\`"
  echo "- Changed: \`$changed\`"
  echo "- OK: \`$ok_value\`"
  echo "- Log: \`$LOG_FILE\`"
  echo "- Summary JSON: \`$SUMMARY_JSON\`"
} > "$SUMMARY_MD"

echo "summary_md: $SUMMARY_MD" | tee -a "$LOG_FILE"
echo "summary_json: $SUMMARY_JSON" | tee -a "$LOG_FILE"

if [[ "$rc" -ne 0 ]]; then
  echo "FAIL: tier-1 status auto-publish failed (exit=$rc)" | tee -a "$LOG_FILE"
  exit "$rc"
fi

echo "PASS: tier-1 status auto-publish completed" | tee -a "$LOG_FILE"
