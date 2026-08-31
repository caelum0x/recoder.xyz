#!/usr/bin/env bash
#
# sign-desktop-inside-out.sh — native-codesign the packed Recoder.app.
#
# WHY not electron-builder's @electron/osx-sign: the app bundles the backend's
# self-contained node_modules (~100K+ files) and osx-sign opens more fds than
# kern.maxfilesperproc allows → EMFILE. Native codesign (few fds per call)
# signs fine when applied INSIDE-OUT: leaf Mach-O binaries first, then
# framework internals, frameworks, helper apps, and the main bundle last.
# (Recipe: docs/OWNER-RUNBOOK.md §1.)
#
# Usage: scripts/sign-desktop-inside-out.sh <path/to/Recoder.app>

set -euo pipefail

APP="${1:?usage: $0 <path/to/Recoder.app>}"
ID="${RECODER_SIGN_ID:-Developer ID Application: Umut Arhan Suba (947G2G2JXJ)}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENT="$REPO_ROOT/apps/desktop/app/build/entitlements.mac.plist"

[ -d "$APP" ] || { echo "no app bundle at $APP" >&2; exit 1; }
[ -f "$ENT" ] || { echo "no entitlements at $ENT" >&2; exit 1; }

SIGN=(codesign --force --options runtime --timestamp --entitlements "$ENT" -s "$ID")

echo "== 1/5 leaf Mach-O binaries in Resources (batched)"
# node-pty ships extensionless Mach-O helpers. pnpm deploy may clone them as
# mode 0644, which both breaks terminal launch and makes the executable-bit
# candidate scan below miss them. Normalize before signing so they receive the
# hardened-runtime signature required by Apple's notary service.
find "$APP/Contents/Resources/backend/node_modules" -type f \
    -path '*/node-pty@*/node_modules/node-pty/prebuilds/darwin-*/spawn-helper' \
    -exec chmod 0755 {} +
# Candidates: native modules/libs by extension plus executable files; filter to
# real Mach-O by magic (thin arm64 cf fa ed fe / fat ca fe ba be) so shell
# scripts in node_modules are skipped.
MACHO_LIST="$(mktemp)"
find "$APP/Contents/Resources" -type f \
    \( -name "*.node" -o -name "*.dylib" -o -name "*.so" -o -perm +111 \) \
    ! -name "*.sh" ! -name "*.js" ! -name "*.cjs" ! -name "*.mjs" ! -name "*.py" \
    -print0 |
    while IFS= read -r -d '' f; do
        magic=$(head -c 4 "$f" | xxd -p 2>/dev/null || true)
        case "$magic" in
            cffaedfe | cafebabe | feedfacf | cefaedfe) printf '%s\0' "$f" ;;
        esac
    done > "$MACHO_LIST"
COUNT=$(tr -cd '\0' < "$MACHO_LIST" | wc -c | tr -d ' ')
echo "   $COUNT Mach-O leaves"
xargs -0 -n 40 "${SIGN[@]}" < "$MACHO_LIST"
rm -f "$MACHO_LIST"

echo "== 2/5 Electron Framework internals"
EF="$APP/Contents/Frameworks/Electron Framework.framework"
find "$EF/Versions/A/Libraries" -name "*.dylib" -print0 2>/dev/null | xargs -0 -n 20 "${SIGN[@]}" || true
[ -f "$EF/Versions/A/Helpers/chrome_crashpad_handler" ] && "${SIGN[@]}" "$EF/Versions/A/Helpers/chrome_crashpad_handler"
"${SIGN[@]}" "$EF"

echo "== 3/5 other frameworks (Squirrel ShipIt, Mantle, ReactiveObjC, ...)"
for FW in "$APP/Contents/Frameworks/"*.framework; do
    base=$(basename "$FW")
    [ "$base" = "Electron Framework.framework" ] && continue
    SHIPIT="$FW/Versions/A/Resources/ShipIt"
    [ -f "$SHIPIT" ] && "${SIGN[@]}" "$SHIPIT"
    "${SIGN[@]}" "$FW"
done

echo "== 4/5 helper apps"
for HELPER in "$APP/Contents/Frameworks/"*.app; do
    "${SIGN[@]}" "$HELPER"
done

echo "== 5/5 main bundle"
"${SIGN[@]}" "$APP"

echo "== verify (strict, deep)"
codesign --verify --deep --strict "$APP"
echo "SIGNED OK: $APP"
