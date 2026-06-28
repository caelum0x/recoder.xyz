#!/bin/sh
# Conductor substrate entrypoint.
#
# Pins the Conductor's tmux + bd to the vendored binaries built into the image
# (/opt/recoder/substrate), but ONLY when the binary is actually present and
# executable. This keeps the runtime degrade-safe:
#
#   - tmux present -> export RECODER_TMUX_BUILD_PATH so tmux-path.ts resolves the
#     pinned binary instead of falling through to apt's system tmux. We use
#     RECODER_TMUX_BUILD_PATH (which tmux-path.ts existence-checks) rather than
#     CONDUCTOR_TMUX_BIN (used unconditionally) so a stale value can never point
#     the runtime at a dead path.
#   - bd present -> export BD_BIN so the Brain's engine-resolver pins it. If bd
#     is absent we leave BD_BIN unset so resolution falls back to `bd` on PATH.
#
# If a binary is missing (e.g. a toolchain was unavailable during the image
# build), we say so on stderr and continue. The runtime then degrades truthfully.
set -eu

SUBSTRATE_DIR="${RECODER_SUBSTRATE_DIR:-/opt/recoder/substrate}"
PINNED_TMUX="$SUBSTRATE_DIR/tmux"
PINNED_BD="$SUBSTRATE_DIR/bd"

if [ -x "$PINNED_TMUX" ]; then
  export RECODER_TMUX_BUILD_PATH="$PINNED_TMUX"
  echo "substrate: pinned tmux -> $PINNED_TMUX" >&2
else
  echo "substrate: pinned tmux absent; Conductor falls back to system tmux on PATH" >&2
fi

if [ -x "$PINNED_BD" ]; then
  export BD_BIN="$PINNED_BD"
  echo "substrate: pinned bd -> $PINNED_BD" >&2
else
  echo "substrate: pinned bd absent; Brain falls back to system bd on PATH" >&2
fi

exec "$@"
