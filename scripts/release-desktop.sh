#!/usr/bin/env bash
#
# release-desktop.sh — one orchestrated entrypoint for the macOS Apple-Silicon
# signed + notarized DMG release of the Recoder desktop app.
#
# This is the single source of truth for the release SEQUENCE. Both a human on a
# Mac and the `.github/workflows/desktop-release.yml` CI job call this same
# script, so local and CI releases are byte-for-byte the same pipeline. It wraps
# the already-proven building blocks in scripts/ rather than reinventing them:
#
#   version bump   -> apps/desktop/app/version.cjs  (task version)
#   readiness      -> scripts/check-desktop-release-readiness.sh
#   pack (unsigned)-> electron-builder via `task package`
#   sign           -> scripts/sign-desktop-inside-out.sh   (native inside-out)
#   dmg + notarize -> hdiutil + codesign + notarytool + stapler   (this file)
#   verify         -> scripts/publish-desktop-release-local.sh verify
#   publish        -> scripts/publish-desktop-release-local.sh publish
#
# WHY unsigned-pack-then-native-sign (not electron-builder's own osx-sign): the
# .app bundles the backend's self-contained node_modules (~100K+ files) and
# @electron/osx-sign opens more fds than kern.maxfilesperproc allows → EMFILE.
# Native `codesign` (few fds per call) signs it fine INSIDE-OUT. Full rationale:
# docs/OWNER-RUNBOOK.md §1. So this script deliberately runs the pack step with
# Apple creds SCRUBBED from the child env, then signs natively afterward.
#
# ── NEVER hardcodes a secret. All certs/keys come from the environment ──────
# Signing identity (Developer ID Application) is resolved from the login
# keychain by name (RECODER_SIGN_ID). Notarization uses EITHER an App Store
# Connect API key (APPLE_API_KEY = path to .p8, APPLE_API_KEY_ID, APPLE_API_ISSUER)
# OR an Apple ID app-specific password (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD,
# APPLE_TEAM_ID). See RELEASE.md for the full secret table.
#
# Usage:
#   scripts/release-desktop.sh dry-run              # headless: validate config+scripts+env, NO build
#   scripts/release-desktop.sh build                # pack (unsigned) only
#   scripts/release-desktop.sh release              # full: pack -> sign -> dmg -> notarize -> staple -> verify
#   scripts/release-desktop.sh release --bump patch # bump version first (patch|minor|major|prerelease|none)
#   scripts/release-desktop.sh release --publish    # also assemble the hosted release dir (dist/desktop-release)
#
# Env:
#   RECODER_SIGN_ID                 Developer ID Application identity name (keychain)
#   APPLE_API_KEY / _ID / _ISSUER   notarytool App Store Connect API creds (preferred)
#   APPLE_ID / _APP_SPECIFIC_PASSWORD / _TEAM_ID   notarytool Apple-ID creds (alternative)
#   RECODER_BACKEND_NODE_MODULES    self-contained backend node_modules for a signed build
#   RECODER_MAC_ARCH                arm64 (default) | x64 | universal  (see runbook §1b)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DESKTOP_DIR="apps/desktop"
APP_DIR="$DESKTOP_DIR/app"
CONFIG="$APP_DIR/electron-builder.config.cjs"
ARCH="${RECODER_MAC_ARCH:-arm64}"

MODE="${1:-dry-run}"; shift || true
BUMP=""
DO_PUBLISH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump) BUMP="${2:-}"; shift 2 ;;
    --publish) DO_PUBLISH=true; shift ;;
    --) shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

PASS=0; FAIL=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
info() { printf '  \033[36m•\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

app_version() { node -e "console.log(require('./$APP_DIR/package.json').version)"; }

# ── notarize creds present? (mirrors the env-gate in electron-builder.config.cjs)
notarize_creds_present() {
  [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]] && return 0
  [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]] && return 0
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# dry-run: structural validation only. Fully headless, cross-platform, no certs,
# no build, no disk cost. Proves the pipeline is wired correctly.
# ─────────────────────────────────────────────────────────────────────────────
cmd_dry_run() {
  step "Desktop release — DRY RUN (config-validate, no build)"
  echo "root:  $REPO_ROOT"
  echo "arch:  $ARCH"
  echo

  [[ -f "$CONFIG" ]] && pass "electron-builder config present" || fail "missing $CONFIG"

  # Parse the config and assert the release-critical shape.
  if node -e '
    const c = require(process.argv[1]);
    const errs = [];
    if (c.productName !== "Recoder") errs.push("productName != Recoder");
    if (!c.appId) errs.push("appId missing");
    const macTargets = (c.mac && c.mac.target || []).map(t => t.target);
    if (!macTargets.includes("dmg")) errs.push("mac dmg target missing");
    if (!macTargets.includes("zip")) errs.push("mac zip target missing (auto-update channel)");
    if (!c.mac || !c.mac.entitlements) errs.push("mac.entitlements missing");
    if (!c.mac || !c.mac.icon) errs.push("mac.icon missing");
    if (!c.publish || c.publish.provider !== "generic") errs.push("generic publish feed missing");
    if (!c.publish || !/^https:\/\//.test(c.publish.url || "")) errs.push("publish.url not https");
    if (!c.beforePack) errs.push("beforePack fail-loud gate missing");
    if (errs.length) { console.error("CONFIG ERRORS:\n - " + errs.join("\n - ")); process.exit(1); }
    console.log(JSON.stringify({
      productName: c.productName, appId: c.appId,
      macTargets, entitlements: c.mac.entitlements, icon: c.mac.icon,
      publish: c.publish
    }, null, 2));
  ' "$REPO_ROOT/$CONFIG"; then
    pass "electron-builder config parses and has dmg+zip / entitlements / icon / generic feed / beforePack gate"
  else
    fail "electron-builder config failed structural validation"
  fi

  for f in build/entitlements.mac.plist build/icon.icns version.cjs; do
    [[ -f "$APP_DIR/$f" ]] && pass "asset present: $f" || fail "missing asset: $APP_DIR/$f"
  done

  for s in check-desktop-release-readiness.sh sign-desktop-inside-out.sh \
           publish-desktop-release-local.sh verify-desktop-release.sh \
           set-desktop-release-secrets.sh; do
    if [[ -f "scripts/$s" ]]; then
      if bash -n "scripts/$s" 2>/dev/null; then pass "script OK (bash -n): $s"; else fail "syntax error: $s"; fi
    else
      fail "missing script: scripts/$s"
    fi
  done

  # Version reads cleanly.
  if V="$(app_version 2>/dev/null)" && [[ -n "$V" ]]; then pass "app version resolves: $V"; else fail "cannot read app version"; fi

  # Env advisory (never fatal in dry-run — a keyless machine still validates config).
  step "Signing / notarization env (advisory)"
  if notarize_creds_present; then
    pass "notarization creds present in env → a real run would sign+notarize"
  else
    info "no Apple creds in env → a real build here would be UNSIGNED (dev). Supply secrets per RELEASE.md to sign."
  fi
  if [[ -n "${RECODER_BACKEND_NODE_MODULES:-}" ]]; then
    pass "RECODER_BACKEND_NODE_MODULES set (self-contained backend for codesign)"
  else
    info "RECODER_BACKEND_NODE_MODULES unset — required for a SIGNED build (source pnpm symlinks dangle in the bundle). See RELEASE.md."
  fi

  step "Summary"
  printf '  PASS: %d   FAIL: %d\n' "$PASS" "$FAIL"
  [[ "$FAIL" -eq 0 ]] || { echo; printf '\033[31mDRY RUN FAILED\033[0m — fix the above before a real release.\n'; exit 1; }
  printf '\n\033[32mDRY RUN OK\033[0m — pipeline is structurally valid. Real release: scripts/release-desktop.sh release\n'
}

# ─────────────────────────────────────────────────────────────────────────────
# build: unsigned electron-builder pack. Apple creds are scrubbed from the child
# env so electron-builder does NOT attempt osx-sign (EMFILE landmine).
# ─────────────────────────────────────────────────────────────────────────────
cmd_build() {
  step "Pack desktop app (unsigned) via electron-builder"
  command -v task >/dev/null 2>&1 || { echo "Task not installed (https://taskfile.dev). Required to build." >&2; exit 1; }
  info "building engines/server/frontend + packaging (this is heavy)…"
  ( cd "$DESKTOP_DIR" && \
    env -u APPLE_API_KEY -u APPLE_API_KEY_ID -u APPLE_API_ISSUER \
        -u APPLE_ID -u APPLE_APP_SPECIFIC_PASSWORD -u APPLE_TEAM_ID \
        -u CSC_LINK -u CSC_KEY_PASSWORD \
        RECODER_MAC_ARCH="$ARCH" \
        task package -- --mac --"$ARCH" )
  local app="$APP_DIR/make/mac-$ARCH/Recoder.app"
  [[ -d "$app" ]] && pass "unsigned .app packed: $app" || { fail "expected .app not found: $app"; exit 1; }
}

# ─────────────────────────────────────────────────────────────────────────────
# release: full signed+notarized+stapled dmg. macOS only.
# ─────────────────────────────────────────────────────────────────────────────
cmd_release() {
  [[ "$(uname -s)" == "Darwin" ]] || { echo "A signed release must run on macOS." >&2; exit 1; }

  if [[ -n "$BUMP" ]]; then
    step "Bump version ($BUMP)"
    ( cd "$DESKTOP_DIR" && node app/version.cjs "$BUMP" )
  fi
  local version; version="$(app_version)"
  info "releasing Recoder v$version ($ARCH)"

  step "Readiness checks"
  bash scripts/check-desktop-release-readiness.sh

  notarize_creds_present || { echo "No Apple notarization creds in env — cannot produce a notarized DMG. See RELEASE.md." >&2; exit 1; }

  cmd_build

  local app="$APP_DIR/make/mac-$ARCH/Recoder.app"

  step "Native inside-out codesign"
  bash scripts/sign-desktop-inside-out.sh "$app"

  step "Build + sign DMG"
  local dmg="$APP_DIR/Recoder-$ARCH.dmg"
  local sign_id="${RECODER_SIGN_ID:-Developer ID Application: Umut Arhan Suba (947G2G2JXJ)}"
  rm -f "$dmg"
  hdiutil create -volname Recoder -srcfolder "$APP_DIR/make/mac-$ARCH" -format UDZO -ov "$dmg"
  codesign --force --timestamp -s "$sign_id" "$dmg"
  pass "DMG built + signed: $dmg"

  step "Notarize + staple"
  if [[ -n "${APPLE_API_KEY:-}" ]]; then
    xcrun notarytool submit "$dmg" \
      --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
  else
    xcrun notarytool submit "$dmg" \
      --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  fi
  xcrun stapler staple "$dmg"
  pass "DMG notarized + stapled"

  step "Verify signed artifact"
  DMG_PATH="$dmg" APP_PATH="$app" ARCH="$ARCH" bash scripts/publish-desktop-release-local.sh verify

  if [[ "$DO_PUBLISH" == true ]]; then
    step "Assemble hosted release dir"
    DMG_PATH="$dmg" APP_PATH="$app" ARCH="$ARCH" bash scripts/publish-desktop-release-local.sh publish
  fi

  printf '\n\033[32mRELEASE OK\033[0m — Recoder v%s %s signed+notarized+stapled: %s\n' "$version" "$ARCH" "$dmg"
  [[ "$DO_PUBLISH" == true ]] && echo "Hosted release dir assembled at dist/desktop-release (upload per RELEASE.md)."
  echo "Only ever release from main (bd recoder-mhyt). Tag: v$version."
}

case "$MODE" in
  dry-run|dry|validate) cmd_dry_run ;;
  build)                cmd_build ;;
  release)              cmd_release ;;
  -h|--help|help)
    sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *) echo "unknown mode: $MODE (use dry-run | build | release)" >&2; exit 2 ;;
esac
