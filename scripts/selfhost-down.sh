#!/usr/bin/env bash
# Tear down the Recoder self-host stack.
#
#   scripts/selfhost-down.sh            # stop + remove containers, keep volumes
#   scripts/selfhost-down.sh --volumes  # also remove named volumes (DESTROYS DATA)
#
# Named volumes (pgdata, redisdata, qdrantdata, backenddata) are PRESERVED by
# default so your databases survive a down/up cycle. Pass --volumes only when
# you explicitly want a clean slate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.selfhost.yml"
ENV_FILE="$ROOT_DIR/.env.selfhost"

die() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  die "Docker Compose not found."
fi

ENV_ARGS=()
[ -f "$ENV_FILE" ] && ENV_ARGS=(--env-file "$ENV_FILE")

REMOVE_VOLUMES=""
for arg in "$@"; do
  case "$arg" in
    --volumes|-v) REMOVE_VOLUMES="--volumes" ;;
    *) die "unknown argument: $arg (use --volumes to also delete data)" ;;
  esac
done

if [ -n "$REMOVE_VOLUMES" ]; then
  echo "==> stopping stack AND removing volumes (data will be destroyed)"
  "${DC[@]}" "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" down --volumes --remove-orphans
else
  echo "==> stopping stack (volumes preserved)"
  "${DC[@]}" "${ENV_ARGS[@]}" -f "$COMPOSE_FILE" down --remove-orphans
fi

echo "==> done"
