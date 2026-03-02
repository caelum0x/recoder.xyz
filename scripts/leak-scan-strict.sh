#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ALLOWLIST_FILE="scripts/leak-scan-allowlist.regex"
if [[ ! -f "$ALLOWLIST_FILE" ]]; then
  echo "ERROR: allowlist file missing: $ALLOWLIST_FILE" >&2
  exit 2
fi

PATTERN='sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9]{20,}|fw_[A-Za-z0-9]{15,}|csk-[A-Za-z0-9]{20,}|npg_[A-Za-z0-9]{10,}|GOCSPX-[A-Za-z0-9_-]{10,}|postgresql://[^"[:space:]]+:[^"[:space:]]+@'

raw_matches="$(git grep -nE "$PATTERN" -- . \
  ':(exclude)*.env*' \
  ':(exclude)package-lock.json' \
  ':(exclude)pnpm-lock.yaml' \
  ':(exclude)yarn.lock' || true)"

if [[ -z "$raw_matches" ]]; then
  echo "leak-scan: PASS (no matches)"
  exit 0
fi

filtered_matches="$(printf '%s\n' "$raw_matches" | grep -Evf "$ALLOWLIST_FILE" || true)"

if [[ -z "$filtered_matches" ]]; then
  echo "leak-scan: PASS (matches only in allowlisted files)"
  exit 0
fi

echo "leak-scan: FAIL (non-allowlisted matches found)"
echo "---"
printf '%s\n' "$filtered_matches"
exit 1
