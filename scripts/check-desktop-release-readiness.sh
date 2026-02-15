#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_SLUG="${REPO_SLUG:-caelum0x/recoder.xyz}"

REQUIRED_SECRETS=(
  "DESKTOP_CSC_LINK"
  "DESKTOP_CSC_KEY_PASSWORD"
  "DESKTOP_APPLE_ID"
  "DESKTOP_APPLE_APP_SPECIFIC_PASSWORD"
  "DESKTOP_APPLE_TEAM_ID"
)

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; ((PASS+=1)); }
fail() { echo "  FAIL: $1"; ((FAIL+=1)); }

echo "== Desktop Release Readiness =="
echo "repo: $REPO_SLUG"
echo "root: $REPO_ROOT"
echo

if ! command -v gh >/dev/null 2>&1; then
  fail "GitHub CLI (gh) is not installed"
else
  pass "GitHub CLI available"
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  fail "gh auth invalid or expired for github.com (run: gh auth login -h github.com)"
else
  pass "gh auth is valid"
fi

if [[ "$FAIL" -eq 0 ]]; then
  secret_names="$(gh secret list --repo "$REPO_SLUG" --json name --jq '.[].name' 2>/dev/null || true)"
  if [[ -z "$secret_names" ]]; then
    fail "unable to read repo secrets (check repo access: $REPO_SLUG)"
  else
    pass "repo secret list readable"
    for key in "${REQUIRED_SECRETS[@]}"; do
      if echo "$secret_names" | grep -Fxq "$key"; then
        pass "secret present: $key"
      else
        fail "secret missing: $key"
      fi
    done
  fi
fi

echo
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "desktop release readiness: FAIL ($FAIL issue(s))"
  echo "next:"
  echo "  1) gh auth login -h github.com"
  echo "  2) set required desktop secrets"
  echo "  3) push tag v* to trigger desktop release"
  exit 1
fi

echo
echo "desktop release readiness: PASS"
