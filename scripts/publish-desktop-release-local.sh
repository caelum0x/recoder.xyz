#!/usr/bin/env bash
#
# publish-desktop-release-local.sh — turn a LOCALLY built + signed + notarized
# desktop DMG into a hosted, auto-updating release, WITHOUT any CI/CD.
#
# This project has no GitHub Actions release pipeline (the `desktop-release.yml`
# scripts in this dir require CI + repo secrets we don't run). This script is the
# manual, local equivalent: it verifies the on-disk artifact is genuinely
# installable through Gatekeeper, regenerates a CORRECT electron-updater manifest
# that matches the real artifact (the checked-in `latest-mac.yml` drifts), and
# assembles the exact directory to rsync to `dl.recoder.xyz/releases` — the URL
# the site (`site/lib/releases.ts`) and the app auto-updater both read.
#
# Producing the signed+notarized DMG this script verifies (no side-configs):
# signing/notarization is env-gated in the committed
# apps/desktop/app/electron-builder.config.cjs — hardenedRuntime + notarize turn
# on automatically when Apple creds are present in the env
# (APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or
# APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID); keyless builds stay
# unsigned. Point RECODER_BACKEND_NODE_MODULES at a self-contained backend
# deploy before a signed build. Full recipe (incl. the native-codesign path that
# avoids the EMFILE fd-cap landmine): docs/OWNER-RUNBOOK.md §1. No secrets in
# the config — creds are env/keychain only.
#
# Usage:
#   scripts/publish-desktop-release-local.sh verify    # SAFE: checks only, no writes
#   scripts/publish-desktop-release-local.sh publish    # full: zip + manifest + release dir
#
# Env overrides:
#   DMG_PATH   (default apps/desktop/app/Recoder-arm64.dmg)
#   APP_PATH   (default apps/desktop/app/make/mac-arm64/Recoder.app)
#   OUT_DIR    (default dist/desktop-release)
#   BASE_URL   (default https://dl.recoder.xyz/releases)
#   ARCH       (default arm64)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-verify}"
DMG_PATH="${DMG_PATH:-apps/desktop/app/Recoder-arm64.dmg}"
APP_PATH="${APP_PATH:-apps/desktop/app/make/mac-arm64/Recoder.app}"
OUT_DIR="${OUT_DIR:-dist/desktop-release}"
BASE_URL="${BASE_URL:-https://dl.recoder.xyz/releases}"
ARCH="${ARCH:-arm64}"
PKG_JSON="apps/desktop/app/package.json"

PASS=0; FAIL=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
info() { printf '  \033[36m•\033[0m %s\n' "$1"; }

# sha512 as base64 — exactly the digest electron-updater records in latest-mac.yml.
sha512_b64() { openssl dgst -sha512 -binary "$1" | openssl base64 -A; }
sha256_hex() { shasum -a 256 "$1" | awk '{print $1}'; }
bytes()      { stat -f%z "$1"; }

echo "== Publish Desktop Release (local, no-CI) =="
echo "root:    $REPO_ROOT"
echo "mode:    $MODE"
echo "dmg:     $DMG_PATH"
echo "app:     $APP_PATH"
echo "baseUrl: $BASE_URL"
echo

# --- Preconditions ----------------------------------------------------------
command -v openssl >/dev/null 2>&1 || { fail "openssl not found"; }
command -v codesign >/dev/null 2>&1 || { fail "codesign not found (run on macOS)"; }
command -v xcrun    >/dev/null 2>&1 || { fail "xcrun not found (run on macOS)"; }
[[ -f "$PKG_JSON" ]] || { fail "package.json not found at $PKG_JSON"; }

VERSION="$(node -e "console.log(require('./$PKG_JSON').version)" 2>/dev/null || true)"
[[ -n "$VERSION" ]] && pass "app version: $VERSION" || fail "could not read app version"

# --- Artifact presence ------------------------------------------------------
[[ -f "$DMG_PATH" ]] && pass "DMG present ($(bytes "$DMG_PATH") bytes)" || fail "DMG missing: $DMG_PATH"
[[ -d "$APP_PATH" ]] && pass "signed .app present" || fail ".app missing: $APP_PATH"

# --- Security: is it genuinely installable through Gatekeeper? ---------------
if [[ -d "$APP_PATH" ]]; then
  if codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1; then
    # Buffer codesign output first, then parse — piping codesign into an
    # early-exiting filter trips SIGPIPE under `set -o pipefail`.
    csout="$(codesign -dvv "$APP_PATH" 2>&1 || true)"
    ident="$(printf '%s\n' "$csout" | grep -m1 'Authority=Developer ID Application' | sed 's/.*=//' || true)"
    pass "codesign valid — ${ident:-Developer ID}"
  else
    fail "codesign --verify --deep --strict FAILED on the .app"
  fi
fi
if [[ -f "$DMG_PATH" ]]; then
  if xcrun stapler validate "$DMG_PATH" >/dev/null 2>&1; then
    pass "notarization ticket stapled to the DMG"
  else
    fail "stapler validate FAILED — DMG is not notarized/stapled (Gatekeeper will block it)"
  fi
  # spctl is network + optional; report but never fail the run on it.
  if spctl -a -t open --context context:primary-signature "$DMG_PATH" >/dev/null 2>&1; then
    pass "spctl: Gatekeeper accepts the DMG"
  else
    info "spctl assessment inconclusive (offline or first-run) — staple is authoritative offline"
  fi
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo; printf '\033[31m%s check(s) failed — not a shippable artifact.\033[0m\n' "$FAIL"
  exit 1
fi

# --- Manifest facts (computed from the REAL artifact) -----------------------
DMG_SHA="$(sha512_b64 "$DMG_PATH")"
DMG_SIZE="$(bytes "$DMG_PATH")"
DMG_NAME="Recoder-${VERSION}-${ARCH}.dmg"
ZIP_NAME="Recoder-${VERSION}-${ARCH}.zip"

echo
echo "== Real artifact facts =="
info "dmg filename (published): $DMG_NAME"
info "dmg sha512(b64):          $DMG_SHA"
info "dmg size:                 $DMG_SIZE"

# Warn loudly if the checked-in manifest disagrees with reality.
CHECKED_IN="apps/desktop/app/make/latest-mac.yml"
if [[ -f "$CHECKED_IN" ]] && ! grep -q "$DMG_SHA" "$CHECKED_IN" 2>/dev/null; then
  info "NOTE: checked-in $CHECKED_IN does NOT match this DMG — it is stale and must be regenerated (this script does that in publish mode)."
fi

if [[ "$MODE" == "verify" ]]; then
  echo
  printf '\033[32mVERIFY OK\033[0m — artifact is signed, notarized, stapled. Run \033[1mpublish\033[0m to assemble the release dir.\n'
  echo
  echo "When published, wire the site with:"
  echo "  NEXT_PUBLIC_DOWNLOAD_MACOS_URL=$BASE_URL/$DMG_NAME"
  echo "  NEXT_PUBLIC_RELEASE_VERSION=v$VERSION"
  exit 0
fi

# --- Publish: build the updater zip + manifest + release dir ----------------
[[ "$MODE" == "publish" ]] || { echo "unknown mode: $MODE (use 'verify' or 'publish')"; exit 2; }

mkdir -p "$OUT_DIR"
info "assembling release into $OUT_DIR"

# electron-updater updates from the ZIP (the DMG is first-install only).
ZIP_OUT="$OUT_DIR/$ZIP_NAME"
info "zipping signed .app for the updater channel (this is large; be patient)…"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_OUT"
ZIP_SHA="$(sha512_b64 "$ZIP_OUT")"
ZIP_SIZE="$(bytes "$ZIP_OUT")"

# Copy the DMG under its versioned, published name.
cp -f "$DMG_PATH" "$OUT_DIR/$DMG_NAME"

# Regenerate the electron-updater manifest to MATCH the real artifacts.
RELEASE_DATE="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
gen_manifest() {
  cat > "$1" <<YAML
version: $VERSION
files:
  - url: $ZIP_NAME
    sha512: $ZIP_SHA
    size: $ZIP_SIZE
  - url: $DMG_NAME
    sha512: $DMG_SHA
    size: $DMG_SIZE
path: $ZIP_NAME
sha512: $ZIP_SHA
releaseDate: '$RELEASE_DATE'
YAML
}
gen_manifest "$OUT_DIR/latest-mac.yml"
cp -f "$OUT_DIR/latest-mac.yml" "$OUT_DIR/beta-mac.yml"
cp -f "$OUT_DIR/latest-mac.yml" "$OUT_DIR/alpha-mac.yml"

# Human-verifiable checksums for the download page.
( cd "$OUT_DIR" && shasum -a 256 "$DMG_NAME" "$ZIP_NAME" > SHA256SUMS )

echo
printf '\033[32mPUBLISH OK\033[0m — release assembled in %s:\n' "$OUT_DIR"
ls -la "$OUT_DIR"
echo
echo "== Next steps (owner) =="
echo "1. Upload the release dir to the host that serves $BASE_URL:"
echo "     rsync -avz --progress $OUT_DIR/ <user>@<host>:/srv/dl.recoder.xyz/releases/"
echo "2. Wire the site env (site/.env or the deploy env) and rebuild the site:"
echo "     NEXT_PUBLIC_DOWNLOAD_MACOS_URL=$BASE_URL/$DMG_NAME"
echo "     NEXT_PUBLIC_RELEASE_VERSION=v$VERSION"
echo "3. Verify: curl -fsI $BASE_URL/$DMG_NAME  (expect 200 + content-length $DMG_SIZE)"
echo "     curl -fs $BASE_URL/latest-mac.yml    (expect version $VERSION)"
echo "   The Download page flips from 'early access' to real download automatically"
echo "   once NEXT_PUBLIC_DOWNLOAD_MACOS_URL is set (see releasesArePublic())."
