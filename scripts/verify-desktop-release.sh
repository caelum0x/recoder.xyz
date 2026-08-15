#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-local}"
VERSION="${2:-}"
BASE_URL="${BASE_URL:-https://dl.recoder.xyz/releases}"
ARCH="${ARCH:-arm64}"
PKG_JSON="$REPO_ROOT/apps/desktop/app/package.json"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; ((PASS+=1)); }
fail() { echo "  FAIL: $1"; ((FAIL+=1)); }

usage() {
  cat <<'EOF'
Usage:
  bash scripts/verify-desktop-release.sh
  bash scripts/verify-desktop-release.sh local
  bash scripts/verify-desktop-release.sh hosted [version]

Modes:
  local   Verify the locally built signed/notarized macOS arm64 artifact.
  hosted  Verify the hosted macOS arm64 DMG + latest-mac.yml feed.
EOF
}

if [[ "$MODE" == "--" ]]; then
  MODE="${2:-local}"
  VERSION="${3:-}"
fi

if [[ -z "$VERSION" && -f "$PKG_JSON" ]]; then
  VERSION="$(node -e "console.log(require('$PKG_JSON').version)" 2>/dev/null || true)"
fi

echo "== Verify Desktop Private Beta Release =="
echo "mode: $MODE"
if [[ "$MODE" == "hosted" ]]; then
  echo "baseUrl: $BASE_URL"
  echo "version: ${VERSION:-<missing>}"
fi
echo

case "$MODE" in
  local)
    if bash "$REPO_ROOT/scripts/publish-desktop-release-local.sh" verify; then
      pass "local signed/notarized/stapled artifact verified"
      pass "required next step remains manual clean-machine install/boot smoke"
    else
      fail "local artifact verification failed"
    fi
    ;;
  hosted)
    if ! command -v curl >/dev/null 2>&1; then
      fail "curl not installed"
    fi
    if [[ -z "$VERSION" ]]; then
      fail "version is required for hosted verification"
    fi
    if [[ "$FAIL" -eq 0 ]]; then
      dmg_name="Recoder-${VERSION}-${ARCH}.dmg"
      if manifest="$(curl -fs "$BASE_URL/latest-mac.yml" 2>/dev/null)"; then
        pass "latest-mac.yml reachable"
      else
        fail "latest-mac.yml not reachable at $BASE_URL"
      fi
      if curl -fsI "$BASE_URL/$dmg_name" >/dev/null 2>&1; then
        pass "hosted DMG reachable: $dmg_name"
      else
        fail "hosted DMG not reachable: $dmg_name"
      fi
      if [[ "${manifest:-}" == *"version: $VERSION"* ]]; then
        pass "latest-mac.yml version matches $VERSION"
      else
        fail "latest-mac.yml version does not match $VERSION"
      fi
      if [[ "${manifest:-}" == *"$dmg_name"* ]]; then
        pass "latest-mac.yml references the macOS DMG"
      else
        fail "latest-mac.yml does not reference $dmg_name"
      fi
    fi
    ;;
  *)
    usage
    exit 2
    ;;
esac

echo
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "desktop private-beta release verification: FAIL"
  exit 1
fi

echo
echo "desktop private-beta release verification: PASS"
if [[ "$MODE" == "local" ]]; then
  echo "manual exit criteria still required: clean-machine install, boot, sign-in, workspace launch, terminal attach, diff review, and merge."
fi
