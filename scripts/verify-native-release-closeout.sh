#!/usr/bin/env bash
set -euo pipefail

# Runs desktop + mobile verification gates used by P2 closeout.
# Usage:
#   bash scripts/verify-native-release-closeout.sh
#   bash scripts/verify-native-release-closeout.sh <desktop_tag> <mobile_ref>

DESKTOP_TAG="${1:-}"
MOBILE_REF="${2:-}"
FAIL=0

echo "== Native Release Closeout Verification =="
echo

echo "[1/2] Desktop release verification"
if [[ -n "$DESKTOP_TAG" ]]; then
  if ! bash scripts/verify-desktop-release.sh "$DESKTOP_TAG"; then
    FAIL=$((FAIL+1))
  fi
else
  if ! bash scripts/verify-desktop-release.sh; then
    FAIL=$((FAIL+1))
  fi
fi

echo
echo "[2/2] Mobile release verification"
if [[ -n "$MOBILE_REF" ]]; then
  if [[ "$MOBILE_REF" == mobile-v* ]]; then
    if ! EXPECT_EAS_BUILD=true bash scripts/verify-mobile-release.sh "$MOBILE_REF"; then
      FAIL=$((FAIL+1))
    fi
  else
    if ! bash scripts/verify-mobile-release.sh "$MOBILE_REF"; then
      FAIL=$((FAIL+1))
    fi
  fi
else
  if ! bash scripts/verify-mobile-release.sh; then
    FAIL=$((FAIL+1))
  fi
fi

echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "FAIL: native release closeout verification finished with $FAIL failing verifier(s)"
  exit 1
fi
echo "PASS: native release closeout verification completed"
