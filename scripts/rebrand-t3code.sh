#!/usr/bin/env bash
# Rebrand pass for the vendored third_party/t3code subtree.
#
# Per docs/T3CODE-FORK.md section 5: user-facing strings get rebranded
# T3 Code -> Recoder on every import/sync; package internals (@t3tools/*,
# Effect service names, wire field names) stay upstream-shaped so a
# `git subtree pull` stays a clean, mechanical sync instead of a re-rename
# pass. This script is that mechanical, re-appliable patch — never hand-edit
# the vendored tree permanently; re-run this script after every sync instead.
#
# Usage: bash scripts/rebrand-t3code.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="third_party/t3code"

if [ ! -d "$ROOT" ]; then
  echo "error: $ROOT does not exist — run the subtree import first" >&2
  exit 1
fi

# Scope: t3code's own source, excluding nested vendored deps (.repos/ — t3code's
# own vendored copies of alchemy-effect/effect-smol, not t3code's branding),
# node_modules, lockfiles, and git metadata.
FIND_ARGS=(
  "$ROOT" -type f
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.md'
     -o -name '*.env*' -o -name '*.yml' -o -name '*.yaml' -o -name '*.toml' \)
  -not -path "*/node_modules/*"
  -not -path "*/.repos/*"
  -not -path "*/.git/*"
  -not -name 'pnpm-lock.yaml'
)

echo "== 1. User-facing brand string: 'T3 Code' -> 'Recoder' =="
find "${FIND_ARGS[@]}" -print0 | xargs -0 grep -l 'T3 Code' 2>/dev/null | while read -r f; do
  sed -i '' 's/T3 Code/Recoder/g' "$f"
done

echo "== 2. 'T3 Connect' -> 'Recoder Connect' =="
find "${FIND_ARGS[@]}" -print0 | xargs -0 grep -l 'T3 Connect' 2>/dev/null | while read -r f; do
  sed -i '' 's/T3 Connect/Recoder Connect/g' "$f"
done

echo "== 3. Domain: t3.codes -> recoder.xyz =="
find "${FIND_ARGS[@]}" -print0 | xargs -0 grep -l 't3\.codes' 2>/dev/null | while read -r f; do
  sed -i '' 's/t3\.codes/recoder.xyz/g' "$f"
done

echo "== 4. Bundle IDs: com.t3tools.t3code* -> xyz.recoder.remote* (Recoder Remote, mobile) =="
find "${FIND_ARGS[@]}" -print0 | xargs -0 grep -l 'com\.t3tools\.t3code' 2>/dev/null | while read -r f; do
  sed -i '' 's/com\.t3tools\.t3code/xyz.recoder.remote/g' "$f"
done

echo "== 5. Strip the live T3 Clerk publishable key (Recoder uses Better Auth, not Clerk) =="
find "${FIND_ARGS[@]}" -print0 | xargs -0 grep -l 'pk_live_Y2xlcmsudDMuY29kZXMk' 2>/dev/null | while read -r f; do
  sed -i '' 's/pk_live_Y2xlcmsudDMuY29kZXMk/pk_live_REPLACE_WITH_RECODER_KEY_NOT_T3/g' "$f"
done

echo "== 6. Remove t3-identity package-manager publishing workflows (winget/AUR/Homebrew) =="
for wf in publish-aur.yml release.yml release-desktop.yml; do
  p="$ROOT/.github/workflows/$wf"
  if [ -f "$p" ]; then
    rm -f "$p"
    echo "  removed $p (Recoder has its own release pipeline: feat/desktop-release-pipeline)"
  fi
done

echo "== Done. Review with: git -C . status --short $ROOT =="
