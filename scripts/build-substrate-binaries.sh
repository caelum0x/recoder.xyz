#!/usr/bin/env bash
# Build the Conductor's pinned substrate binaries: the vendored tmux (c/tmux/tmux)
# and the reproducible bd / beads binary (go/beads/bin/bd).
#
# WHY THIS EXISTS
# ---------------
# The Conductor resolves its tmux via docker-backend/src/conductor/tmux-path.ts
# (CONDUCTOR_TMUX_BIN > RECODER_TMUX_BUILD_PATH > <repo>/c/tmux/tmux > bare `tmux`)
# and its bd via packages/brain engine-resolver (BD_BIN > bare `bd`). Both have
# build scripts, but nothing in setup/deploy ran them — so on a clean host the
# pinned binaries were absent and the runtime silently fell back to whatever
# `tmux`/`bd` happened to be on PATH, defeating the vendoring/pinning guarantee.
#
# This script is the single operational seam that produces those binaries. It is:
#   - idempotent:   skips a binary that is already present and runnable
#   - degrade-safe: a missing toolchain (autotools/cc/go) logs a clear WARNING
#                   and continues; it never fails the whole setup/deploy. The
#                   runtime already degrades truthfully when a binary is absent.
#   - reusable:     invoked from `make substrate-binaries` AND from the
#                   docker-backend image build (Dockerfile), so the deployed
#                   container ships the pinned binaries instead of apt's tmux.
#
# After a successful build it prints the env exports the runtime expects:
#   CONDUCTOR_TMUX_BIN / RECODER_TMUX_BUILD_PATH  -> the pinned tmux
#   BD_BIN                                        -> the pinned bd
#
# Usage:
#   ./scripts/build-substrate-binaries.sh                 # build both (skip if present)
#   SUBSTRATE_FORCE=1 ./scripts/build-substrate-binaries.sh   # rebuild even if present
#   SUBSTRATE_SKIP_BD=1 ./scripts/build-substrate-binaries.sh # tmux only
#   SUBSTRATE_SKIP_TMUX=1 ./scripts/build-substrate-binaries.sh # bd only
#
# Exit status is 0 even when a toolchain is missing (degrade-safe). Set
# SUBSTRATE_STRICT=1 to make a failed/absent build a hard error instead.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TMUX_BIN="$REPO_ROOT/c/tmux/tmux"
BD_BIN_OUT="${RECODER_BD_OUT:-$REPO_ROOT/go/beads/bin/bd}"

FORCE="${SUBSTRATE_FORCE:-0}"
STRICT="${SUBSTRATE_STRICT:-0}"

WARNINGS=0
warn() { echo "WARNING(substrate): $*" >&2; WARNINGS=$((WARNINGS + 1)); }
info() { echo "→ $*"; }
ok()   { echo "✓ $*"; }

# A binary is "good" if it exists and is executable. We deliberately do NOT run
# `./tmux -V` / `bd --version` as the liveness gate here, because the binary may
# be cross-built for a different OS/arch (e.g. built on macOS for inspection but
# rebuilt inside the linux image). Presence + exec bit is the idempotency check;
# the runtime does its own truthful liveness check at use time.
is_good() { [ -x "$1" ]; }

build_tmux() {
  if [ "${SUBSTRATE_SKIP_TMUX:-0}" = "1" ]; then
    info "tmux build skipped (SUBSTRATE_SKIP_TMUX=1)"
    return 0
  fi
  if [ ! -f "$REPO_ROOT/c/tmux/tmux.c" ]; then
    warn "vendored tmux source missing at c/tmux — cannot build pinned tmux"
    return 1
  fi
  if [ "$FORCE" != "1" ] && is_good "$TMUX_BIN"; then
    ok "pinned tmux already present: $TMUX_BIN (skip; SUBSTRATE_FORCE=1 to rebuild)"
    return 0
  fi
  if ! command -v cc >/dev/null 2>&1; then
    warn "no C compiler (cc) on PATH — skipping pinned tmux build; runtime will fall back to system tmux"
    return 1
  fi

  info "building pinned tmux from c/tmux"
  # The Makefile build-tmux target already picks configure-vs-manual; reuse the
  # same logic here so there is one source of truth for how tmux is compiled.
  if command -v autoconf >/dev/null 2>&1 && [ -f "$REPO_ROOT/c/tmux/configure" ]; then
    bash "$SCRIPT_DIR/build-tmux.sh" || { warn "configure-based tmux build failed"; }
  fi
  if ! is_good "$TMUX_BIN"; then
    info "falling back to autotools-free manual tmux build"
    bash "$SCRIPT_DIR/build-tmux-manual.sh" || { warn "manual tmux build failed"; }
  fi

  if is_good "$TMUX_BIN"; then
    ok "pinned tmux built: $TMUX_BIN"
    return 0
  fi
  warn "tmux build did not produce $TMUX_BIN (likely missing libevent/ncurses dev headers); runtime will fall back to system tmux"
  return 1
}

build_bd() {
  if [ "${SUBSTRATE_SKIP_BD:-0}" = "1" ]; then
    info "bd build skipped (SUBSTRATE_SKIP_BD=1)"
    return 0
  fi
  if [ ! -f "$REPO_ROOT/go/beads/cmd/bd/main.go" ]; then
    warn "vendored beads source missing at go/beads — cannot build pinned bd"
    return 1
  fi
  if [ "$FORCE" != "1" ] && is_good "$BD_BIN_OUT"; then
    ok "pinned bd already present: $BD_BIN_OUT (skip; SUBSTRATE_FORCE=1 to rebuild)"
    return 0
  fi
  if ! command -v go >/dev/null 2>&1; then
    warn "no go toolchain on PATH — skipping pinned bd build; runtime will fall back to system bd"
    return 1
  fi

  info "building pinned bd from go/beads"
  if RECODER_BD_OUT="$BD_BIN_OUT" bash "$SCRIPT_DIR/build-bd.sh"; then
    ok "pinned bd built: $BD_BIN_OUT"
    return 0
  fi
  warn "bd build failed (check Go toolchain version vs go/beads/go.mod, and a C compiler for cgo); runtime will fall back to system bd"
  return 1
}

echo "== Conductor substrate binaries =="
echo "repo: $REPO_ROOT"

TMUX_RC=0; BD_RC=0
build_tmux || TMUX_RC=1
build_bd   || BD_RC=1

echo
echo "-- substrate summary --"
if is_good "$TMUX_BIN"; then
  echo "tmux: $TMUX_BIN"
  echo "  export CONDUCTOR_TMUX_BIN=$TMUX_BIN"
  echo "  export RECODER_TMUX_BUILD_PATH=$TMUX_BIN"
else
  echo "tmux: NOT BUILT (runtime falls back to system tmux on PATH)"
fi
if is_good "$BD_BIN_OUT"; then
  echo "bd:   $BD_BIN_OUT"
  echo "  export BD_BIN=$BD_BIN_OUT"
else
  echo "bd:   NOT BUILT (runtime falls back to system bd on PATH)"
fi

if [ "$STRICT" = "1" ] && { [ "$TMUX_RC" != "0" ] || [ "$BD_RC" != "0" ]; }; then
  echo "✗ SUBSTRATE_STRICT=1 and at least one binary was not produced" >&2
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  echo
  echo "Completed with $WARNINGS warning(s). Substrate binaries are best-effort:"
  echo "the deploy continues and the runtime degrades truthfully where a binary is absent."
fi
exit 0
