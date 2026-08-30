#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; ((PASS+=1)); }
fail() { echo "  FAIL: $1"; ((FAIL+=1)); }

echo "== Desktop Private Beta Release Readiness =="
echo "root: $REPO_ROOT"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "manual desktop beta release must run on macOS"
else
  pass "running on macOS"
fi

for cmd in node pnpm openssl codesign xcrun spctl ditto security; do
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "tool available: $cmd"
  else
    fail "required macOS release tool missing: $cmd"
  fi
done

if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  pass "Developer ID Application identity present in local keychain"
else
  fail "no Developer ID Application identity found in local keychain"
fi

if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  pass "Apple notarization API credentials present in environment"
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  pass "Apple ID notarization credentials present in environment"
else
  fail "missing Apple notarization credentials in environment"
fi

if [[ -f "$REPO_ROOT/apps/desktop/app/electron-builder.config.cjs" ]]; then
  pass "desktop packaging config present"
else
  fail "missing apps/desktop/app/electron-builder.config.cjs"
fi

if [[ -x "$REPO_ROOT/scripts/publish-desktop-release-local.sh" ]]; then
  pass "local publish script present"
else
  fail "missing executable scripts/publish-desktop-release-local.sh"
fi

echo
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "desktop private-beta release readiness: FAIL ($FAIL issue(s))"
  echo "next:"
  echo "  1) run this on the macOS arm64 release machine"
  echo "  2) install the Developer ID identity and notarization credentials"
  echo "  3) build from main, then run pnpm run verify:desktop-release"
  exit 1
fi

echo
echo "desktop private-beta release readiness: PASS"
