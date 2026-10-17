#!/bin/sh
# Conductor substrate entrypoint.
#
# Pins the Conductor's tmux + bd + loom to the vendored binaries built into the
# image (/opt/recoder/substrate), but ONLY when the binary is actually present
# and executable. This keeps the runtime degrade-safe:
#
#   - tmux present -> export RECODER_TMUX_BUILD_PATH so tmux-path.ts resolves the
#     pinned binary instead of falling through to apt's system tmux. We use
#     RECODER_TMUX_BUILD_PATH (which tmux-path.ts existence-checks) rather than
#     CONDUCTOR_TMUX_BIN (used unconditionally) so a stale value can never point
#     the runtime at a dead path.
#   - bd present -> export BD_BIN so the Brain's engine-resolver pins it. If bd
#     is absent we leave BD_BIN unset so resolution falls back to `bd` on PATH.
#   - loom present -> export CONDUCTOR_LOOM_BIN so loom-path.ts resolves the
#     pinned binary. Loom (unlike tmux/bd) is THE default workspace substrate
#     with NO silent runtime fallback, so if it is absent we deliberately leave
#     CONDUCTOR_LOOM_BIN unset rather than pointing it at a dead path — the
#     Conductor then fails loud exactly as documented (docs/SELF-HOST.md
#     "Known gaps" #1), until an operator sets CONDUCTOR_LOOM_DISABLED=1 or
#     mounts a self-built binary.
#
# If a binary is missing (e.g. a toolchain was unavailable during the image
# build), we say so on stderr and continue. The runtime then degrades truthfully.
set -eu

SUBSTRATE_DIR="${RECODER_SUBSTRATE_DIR:-/opt/recoder/substrate}"
PINNED_TMUX="$SUBSTRATE_DIR/tmux"
PINNED_BD="$SUBSTRATE_DIR/bd"
PINNED_LOOM="$SUBSTRATE_DIR/loom"

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

if [ -x "$PINNED_LOOM" ]; then
  export CONDUCTOR_LOOM_BIN="$PINNED_LOOM"
  echo "substrate: pinned loom -> $PINNED_LOOM" >&2
else
  echo "substrate: pinned loom absent; loom-default workspace launches will fail loud unless CONDUCTOR_LOOM_DISABLED=1 or CONDUCTOR_LOOM_BIN is set" >&2
fi

exec "$@"
