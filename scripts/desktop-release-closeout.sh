#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-verify}"
VERSION="${2:-}"
WRITE=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/desktop-release-closeout.sh verify
  bash scripts/desktop-release-closeout.sh publish [--write]
  bash scripts/desktop-release-closeout.sh hosted [version]

Examples:
  bash scripts/desktop-release-closeout.sh verify
  bash scripts/desktop-release-closeout.sh publish --write
  bash scripts/desktop-release-closeout.sh hosted 0.16.1

Behavior:
  - always runs readiness checks first
  - verify checks the local signed/notarized/stapled macOS arm64 artifact
  - publish is dry-run by default; with --write it assembles the release dir
  - hosted verifies the published macOS arm64 DMG + update manifest
  - manual clean-machine install/boot smoke remains required before invites
EOF
}

shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --write)
      WRITE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$VERSION" || "$VERSION" == "$1" ]]; then
        VERSION="$1"
        shift
      else
        echo "unknown arg: $1"
        usage
        exit 2
      fi
      ;;
  esac
done

echo "== Desktop Private Beta Release Closeout =="
echo "mode: $MODE"
if [[ -n "$VERSION" ]]; then
  echo "version: $VERSION"
fi
echo "mode: $([[ "$WRITE" == true ]] && echo write || echo dry-run)"
echo

pnpm -C "$REPO_ROOT" run check:desktop-release-readiness

case "$MODE" in
  verify)
    pnpm -C "$REPO_ROOT" run verify:desktop-release
    ;;
  publish)
    if [[ "$WRITE" == true ]]; then
      bash "$REPO_ROOT/scripts/publish-desktop-release-local.sh" publish
    else
      echo "[dry-run] would assemble the private-beta release dir:"
      echo "          bash scripts/publish-desktop-release-local.sh publish"
    fi
    ;;
  hosted)
    if [[ -z "$VERSION" ]]; then
      echo "hosted mode requires a version argument"
      exit 2
    fi
    pnpm -C "$REPO_ROOT" run verify:desktop-release -- hosted "$VERSION"
    ;;
  *)
    usage
    exit 2
    ;;
esac

echo
echo "Required before inviting testers:"
echo "  1) clean-machine install of the signed DMG"
echo "  2) first boot without Gatekeeper warnings"
echo "  3) sign-in, workspace launch, terminal attach"
echo "  4) diff review, governed approval, and merge on a representative repo"
