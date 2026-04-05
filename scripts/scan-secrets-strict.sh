#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ALLOWLIST_FILE="scripts/secret-scan-allowlist.regex"
if [[ ! -f "$ALLOWLIST_FILE" ]]; then
  echo "ERROR: allowlist file missing: $ALLOWLIST_FILE" >&2
  exit 2
fi

# High-signal secret and credential patterns.
# Expanded 2026-04-05 after discovering committed Anthropic/Google/OpenAI/recoder
# API keys + GitHub App PEMs in git history. Adds: GitHub tokens, AWS keys,
# Stripe live keys, recoder internal keys, Slack tokens, inline PEM headers,
# MySQL/MongoDB URLs with embedded credentials.
PATTERN='sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9]{20,}|fw_[A-Za-z0-9]{15,}|csk-[A-Za-z0-9]{20,}|npg_[A-Za-z0-9]{10,}|GOCSPX-[A-Za-z0-9_-]{10,}|postgresql://[^"[:space:]]+:[^"[:space:]]+@|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|(sk|rk)_live_[A-Za-z0-9]{24,}|recoder_sk_live_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----|mysql://[^"[:space:]]+:[^"[:space:]]+@|mongodb(\+srv)?://[^"[:space:]]+:[^"[:space:]]+@'

raw_matches="$(git grep -nE "$PATTERN" -- . \
  ':(exclude)*.env*' \
  ':(exclude)package-lock.json' \
  ':(exclude)pnpm-lock.yaml' \
  ':(exclude)yarn.lock' || true)"

if [[ -z "$raw_matches" ]]; then
  echo "secret-scan: PASS (no matches)"
  exit 0
fi

filtered_matches="$(printf '%s\n' "$raw_matches" | grep -Evf "$ALLOWLIST_FILE" || true)"

if [[ -z "$filtered_matches" ]]; then
  echo "secret-scan: PASS (matches only in allowlisted files)"
  exit 0
fi

echo "secret-scan: FAIL (non-allowlisted matches found)"
echo "---"
printf '%s\n' "$filtered_matches"
exit 1
