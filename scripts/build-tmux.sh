#!/usr/bin/env bash
# Build the vendored tmux binary from c/tmux and pin it.
#
# Per docs/RECODER-PRODUCT-ARCHITECTURE.md §8c (LOCKED): tmux is a vendored C
# binary, pinned in the runtime image and driven via its CLI by the Conductor
# substrate. We own it by vendoring + building + pinning, never reimplementing.
#
# Produces: c/tmux/tmux (the compiled binary).
# Requires: a C compiler (cc), autotools (autoconf/libtool), and libevent +
#   ncurses development headers (macOS ships ncurses; brew install libevent).
#
# Usage:
#   ./scripts/build-tmux.sh            # build in place
#   RECODER_TMUX_BUILD_PATH=/x ./scripts/build-tmux.sh  # override output
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMUX_SRC="$REPO_ROOT/c/tmux"

if [ ! -f "$TMUX_SRC/tmux.c" ]; then
  echo "✗ vendored tmux source not found at $TMUX_SRC" >&2
  exit 1
fi

echo "→ building vendored tmux from $TMUX_SRC"

cd "$TMUX_SRC"

# autotools bootstrap (only if configure does not exist yet).
if [ ! -f ./configure ]; then
  if [ -x ./autogen.sh ]; then
    echo "→ autogen.sh"
    ./autogen.sh
  else
    echo "✗ no configure and no autogen.sh — cannot bootstrap tmux build" >&2
    exit 1
  fi
fi

echo "→ ./configure"
./configure --prefix="$TMUX_SRC/_install" --disable-utf8proc 2>/dev/null || ./configure --prefix="$TMUX_SRC/_install"

echo "→ make"
make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)" 2>&1 | tail -5

if [ -x "$TMUX_SRC/tmux" ]; then
  echo "✓ tmux built: $TMUX_SRC/tmux"
  "$TMUX_SRC/tmux" -V || true
  echo
  echo "Pin it for the Conductor by setting:"
  echo "  RECODER_TMUX_BUILD_PATH=$TMUX_SRC/tmux"
  echo "or export CONDUCTOR_TMUX_BIN=$TMUX_SRC/tmux"
else
  echo "✗ build did not produce a tmux binary at $TMUX_SRC/tmux" >&2
  echo "  Common fix: brew install libevent (macOS) or apt install libevent-dev libncurses-dev (Linux)" >&2
  exit 1
fi
