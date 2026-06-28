#!/usr/bin/env bash
# Recoder one-command self-host bring-up.
#
#   scripts/selfhost-up.sh
#
# What it does, in order:
#   1. Locates the repo root and the compose file.
#   2. Loads .env.selfhost (creating it from the example if absent).
#   3. Generates safe secrets (INTERNAL_SERVICE_KEY, RECODER_GOVERNANCE_SIGNING_KEY,
#      BETTER_AUTH_SECRET) into .env.selfhost when they are empty.
#   4. FAILS FAST with a clear message for required values it must not generate
#      (POSTGRES_USER / POSTGRES_PASSWORD).
#   5. Verifies Docker + compose + build prerequisites are present.
#   6. `docker compose up -d --build`.
#   7. Waits for every service healthcheck to go healthy (bounded, honest timeout).
#   8. Prints the URLs.
#
# Real and runnable. No stubs, no faked success: if a healthcheck never goes
# healthy this script exits non-zero and dumps the failing service logs.
set -euo pipefail

# --- Locate repo root (this script lives in <root>/scripts) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.selfhost.yml"
ENV_FILE="$ROOT_DIR/.env.selfhost"
ENV_EXAMPLE="$ROOT_DIR/.env.selfhost.example"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }

[ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"

# --- Resolve the docker compose command (v2 plugin or legacy) ---
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  die "Docker Compose not found. Install Docker Desktop or the compose plugin."
fi
command -v docker >/dev/null 2>&1 || die "docker CLI not found on PATH."
docker info >/dev/null 2>&1 || die "Docker daemon is not running or not reachable."

# --- Ensure .env.selfhost exists ---
if [ ! -f "$ENV_FILE" ]; then
  [ -f "$ENV_EXAMPLE" ] || die "neither $ENV_FILE nor $ENV_EXAMPLE exists."
  info "creating $ENV_FILE from template"
  cp -f "$ENV_EXAMPLE" "$ENV_FILE"
fi

# --- Secret generation helper (portable; falls back if openssl absent) ---
gen_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Read a KEY=value from the env file (raw, last wins).
read_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true
}

# Set KEY=value in the env file (replace existing line or append).
set_env() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # Use a non-/ delimiter; hex secrets never contain '|'.
    sed "s|^${key}=.*|${key}=${val}|" "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
  fi
  mv -f "$tmp" "$ENV_FILE"
}

# Auto-generate safe secrets when empty.
for key in INTERNAL_SERVICE_KEY RECODER_GOVERNANCE_SIGNING_KEY BETTER_AUTH_SECRET; do
  cur="$(read_env "$key")"
  if [ -z "$cur" ]; then
    info "generating $key"
    set_env "$key" "$(gen_hex)"
  fi
done

# --- Fail fast on required values we must NOT generate ---
missing=()
for key in POSTGRES_USER POSTGRES_PASSWORD; do
  val="$(read_env "$key")"
  [ -n "$val" ] || missing+=("$key")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "ERROR: required value(s) missing in $ENV_FILE:" >&2
  for k in "${missing[@]}"; do echo "  - $k" >&2; done
  echo "Edit $ENV_FILE and set them, then re-run scripts/selfhost-up.sh" >&2
  exit 1
fi

# --- Build prerequisites the Dockerfile assumes (honest check, no silent stub) ---
[ -f "$ROOT_DIR/docker-backend/dist/server.js" ] \
  || die "docker-backend/dist/server.js is missing. Build it first: (cd docker-backend && pnpm install && pnpm build). See deploy/README.md."
if [ ! -d "$ROOT_DIR/pi-mono-dist" ]; then
  cat >&2 <<'EOF'
ERROR: pi-mono-dist/ is missing. The backend Dockerfile copies it for the
optional Pi coding-agent SDK. Provide a built pi-mono-dist/ (see deploy/README.md),
or create an empty stub layout if you do not need Pi:
  mkdir -p pi-mono-dist/coding-agent
  printf '{"name":"@recoder/pi-coding-agent","version":"0.0.0","private":true}\n' > pi-mono-dist/coding-agent/package.json
  mkdir -p pi-mono-dist/coding-agent/dist
EOF
  exit 1
fi

# --- Bring the stack up ---
info "building and starting the Recoder self-host stack"
"${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

# --- Wait for healthchecks (bounded) ---
SERVICES=(postgres redis qdrant backend envoy)
DEADLINE=$(( $(date +%s) + 600 ))  # 10 minutes max
info "waiting for services to become healthy (timeout 600s)"

container_id() { "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$1"; }

health_of() {
  local cid="$1"
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo "unknown"
}

for svc in "${SERVICES[@]}"; do
  cid="$(container_id "$svc")"
  [ -n "$cid" ] || die "service '$svc' has no container (compose up failed)."
  while :; do
    st="$(health_of "$cid")"
    case "$st" in
      healthy|running)
        # 'running' only acceptable for services with no healthcheck; all of
        # ours define one, so insist on 'healthy' when a healthcheck exists.
        if [ "$st" = "healthy" ]; then echo "  $svc: healthy"; break; fi
        # No health block -> running is the terminal good state.
        if [ -z "$(docker inspect -f '{{if .State.Health}}y{{end}}' "$cid")" ]; then
          echo "  $svc: running (no healthcheck)"; break
        fi
        ;;
      unhealthy)
        echo "  $svc: UNHEALTHY" >&2
        "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail 50 "$svc" >&2 || true
        die "service '$svc' is unhealthy. See logs above."
        ;;
    esac
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
      echo "  $svc: TIMEOUT (last status: $st)" >&2
      "${DC[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail 50 "$svc" >&2 || true
      die "timed out waiting for '$svc' to become healthy."
    fi
    sleep 4
  done
done

# --- Print URLs ---
BACKEND_PORT="$(read_env BACKEND_PORT)"; BACKEND_PORT="${BACKEND_PORT:-3100}"
EDGE_HTTP_PORT="$(read_env EDGE_HTTP_PORT)"; EDGE_HTTP_PORT="${EDGE_HTTP_PORT:-8080}"
ENVOY_ADMIN_PORT="$(read_env ENVOY_ADMIN_PORT)"; ENVOY_ADMIN_PORT="${ENVOY_ADMIN_PORT:-9901}"

cat <<EOF

Recoder self-host is up.

  Control plane (direct):   http://localhost:${BACKEND_PORT}
  Health:                   http://localhost:${BACKEND_PORT}/health
  Edge (Envoy):             http://localhost:${EDGE_HTTP_PORT}
  Envoy admin:              http://localhost:${ENVOY_ADMIN_PORT}

Stop with:  scripts/selfhost-down.sh
Logs with:  docker compose --env-file .env.selfhost -f docker-compose.selfhost.yml logs -f
EOF
