#!/usr/bin/env bash
# Build the `bd` (beads) issue-tracker binary reproducibly from go/beads.
#
# The Conductor uses beads (`bd`) for the related-task graph it folds into a
# BrainContext bundle (docker-backend/src/conductor/bundle.ts). Today the only
# working `bd` is a developer-local `go install`; this script makes the binary
# reproducible from the vendored go/beads source so any host (laptop, CI, the
# runtime image) can produce an identical, version-stamped binary.
#
# Canonical build per go/beads/.goreleaser.yml and go/beads/.buildflags:
#   - main package:  ./cmd/bd
#   - CGO_ENABLED=1  (embedded Dolt engine requires cgo; .buildflags defaults it)
#   - -tags gms_pure_go  (go-mysql-server stdlib regex, no ICU — see docs/ICU-POLICY.md)
#   - ldflags inject main.Version / main.Build / main.Commit / main.Branch
#
# We do NOT modify the go/beads source (it is a pinned upstream clone). We only
# source its own .buildflags and invoke `go build`.
#
# Produces: go/beads/bin/bd  (override with RECODER_BD_OUT=/path/to/bd)
# Requires: a Go toolchain matching go/beads/go.mod, plus a C compiler (cgo).
#
# Usage:
#   ./scripts/build-bd.sh                      # build to go/beads/bin/bd
#   RECODER_BD_OUT=/usr/local/bin/bd ./scripts/build-bd.sh
#   CGO_ENABLED=0 ./scripts/build-bd.sh        # server-only (no embedded Dolt)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BEADS_SRC="$REPO_ROOT/go/beads"

OUT="${RECODER_BD_OUT:-$BEADS_SRC/bin/bd}"

if [ ! -f "$BEADS_SRC/cmd/bd/main.go" ]; then
  echo "✗ vendored beads source not found at $BEADS_SRC/cmd/bd" >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "✗ go toolchain not found on PATH" >&2
  echo "  Install Go matching go/beads/go.mod (see 'go' directive in that file)." >&2
  exit 1
fi

cd "$BEADS_SRC"

# Source the project's canonical build flags. This sets/exports:
#   CGO_ENABLED (default 1, embedded-Dolt capable; caller may override to 0)
#   BEADS_BUILD_TAGS=gms_pure_go
#   GOFLAGS += -tags=gms_pure_go   (idempotent)
# shellcheck disable=SC1091
source "$BEADS_SRC/.buildflags"

# Version stamping, mirroring .goreleaser.yml ldflags. When git metadata is
# unavailable (e.g. an exported tarball) we fall back to the values already
# baked into cmd/bd/version.go, so the build still succeeds.
GIT_COMMIT="$(git -C "$BEADS_SRC" rev-parse HEAD 2>/dev/null || echo "")"
GIT_SHORT="$(git -C "$BEADS_SRC" rev-parse --short HEAD 2>/dev/null || echo "dev")"
GIT_BRANCH="$(git -C "$BEADS_SRC" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

LDFLAGS="-s -w"
LDFLAGS="$LDFLAGS -X main.Build=$GIT_SHORT"
[ -n "$GIT_COMMIT" ] && LDFLAGS="$LDFLAGS -X main.Commit=$GIT_COMMIT"
[ -n "$GIT_BRANCH" ] && LDFLAGS="$LDFLAGS -X main.Branch=$GIT_BRANCH"

mkdir -p "$(dirname "$OUT")"

echo "→ building bd from $BEADS_SRC/cmd/bd"
echo "  CGO_ENABLED=${CGO_ENABLED}  tags=${BEADS_BUILD_TAGS}  out=$OUT"
echo "  build=$GIT_SHORT branch=${GIT_BRANCH:-<none>}"

# GOFLAGS already carries -tags=gms_pure_go from .buildflags; pass it again
# explicitly so the build is correct even if a caller cleared GOFLAGS.
go build \
  -tags "$BEADS_BUILD_TAGS" \
  -ldflags "$LDFLAGS" \
  -o "$OUT" \
  ./cmd/bd

if [ ! -x "$OUT" ]; then
  echo "✗ build did not produce an executable at $OUT" >&2
  exit 1
fi

echo "✓ bd built: $OUT"
"$OUT" --version || "$OUT" version || true
echo
echo "Pin it for the Conductor by putting it on PATH, e.g.:"
echo "  cp -f \"$OUT\" /usr/local/bin/bd"
echo "or export the directory:"
echo "  export PATH=\"$(dirname "$OUT"):\$PATH\""
