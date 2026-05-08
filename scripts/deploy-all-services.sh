#!/bin/bash
set -euo pipefail

# Deploy all services to Hetzner production server (77.42.23.19)
# Usage: ./scripts/deploy-all-services.sh
#
# Prerequisites:
#   - SSH key access to root@77.42.23.19
#   - Docker and docker-compose installed on server
#   - Repository cloned at /root/recoder.xyz on server

SERVER="root@77.42.23.19"
REMOTE_DIR="/root/recoder.xyz"

# SSH options: keep-alive every 30s, tolerate 20 missed pings (10 min idle tolerance)
SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o TCPKeepAlive=yes -o ConnectionAttempts=3"
if [ -f "${HOME}/.ssh/id_ed25519_hetzner" ]; then
  SSH_OPTS="${SSH_OPTS} -i ${HOME}/.ssh/id_ed25519_hetzner"
fi

DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-85}"
DISK_RECLAIM_PERCENT="${DISK_RECLAIM_PERCENT:-88}"
DISK_FAIL_PERCENT="${DISK_FAIL_PERCENT:-90}"

ssh_cmd() {
  ssh $SSH_OPTS "${SERVER}" "$@"
}

remote_disk_usage() {
  ssh $SSH_OPTS "${SERVER}" "df / --output=pcent | tail -1 | tr -d ' %'" 2>/dev/null || echo "0"
}

remote_safe_docker_reclaim() {
  ssh $SSH_OPTS "${SERVER}" \
    "docker image prune -f >/tmp/recoder-docker-image-prune.log 2>&1 || true; \
     docker builder prune -f >/tmp/recoder-docker-builder-prune.log 2>&1 || true; \
     tail -n 20 /tmp/recoder-docker-image-prune.log 2>/dev/null || true; \
     tail -n 20 /tmp/recoder-docker-builder-prune.log 2>/dev/null || true"
}

# Retry wrapper: retries an SSH command up to N times on connection failure
ssh_retry() {
  local max_attempts="${1:-3}"
  local delay="${2:-10}"
  shift 2
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if ssh $SSH_OPTS "${SERVER}" "$@"; then
      return 0
    fi
    local exit_code=$?
    # Only retry on SSH transport errors (255), not on command failures
    if [ "$exit_code" -ne 255 ]; then
      return "$exit_code"
    fi
    echo "[retry] SSH connection lost (attempt ${attempt}/${max_attempts}), retrying in ${delay}s..."
    sleep "$delay"
    attempt=$((attempt + 1))
  done
  echo "[retry] All ${max_attempts} attempts failed"
  return 255
}

echo "=== Phase 0: Pre-flight checks ==="

# Verify SSH connectivity
echo -n "Checking SSH connectivity... "
if ! ssh $SSH_OPTS "${SERVER}" "echo ok" >/dev/null 2>&1; then
  echo "FAIL"
  echo "FATAL: Cannot reach ${SERVER} via SSH."
  exit 1
fi
echo "OK"

# Check disk space and attempt safe Docker reclaim before build pressure turns
# into ENOSPC during image rebuilds.
echo -n "Checking disk space... "
DISK_USAGE="$(remote_disk_usage)"
if [ "$DISK_USAGE" -ge "$DISK_RECLAIM_PERCENT" ]; then
  echo "WARN (${DISK_USAGE}% used — attempting safe Docker reclaim)"
  remote_safe_docker_reclaim
  DISK_USAGE="$(remote_disk_usage)"
  echo -n "Re-checked disk space... "
fi
if [ "$DISK_USAGE" -gt "$DISK_FAIL_PERCENT" ]; then
  echo "FAIL (${DISK_USAGE}%)"
  echo "FATAL: Root filesystem is ${DISK_USAGE}% full after safe reclaim. Free space before deploying."
  exit 1
fi
if [ "$DISK_USAGE" -ge "$DISK_WARN_PERCENT" ]; then
  echo "WARN (${DISK_USAGE}% used)"
else
  echo "OK (${DISK_USAGE}% used)"
fi

# Check Docker daemon is running
echo -n "Checking Docker daemon... "
if ! ssh $SSH_OPTS "${SERVER}" "docker info >/dev/null 2>&1"; then
  echo "FAIL"
  echo "FATAL: Docker daemon is not running on ${SERVER}."
  exit 1
fi
echo "OK"

# Check available memory (warn if <1GB free)
echo -n "Checking available memory... "
FREE_MB=$(ssh $SSH_OPTS "${SERVER}" "free -m | awk '/^Mem:/{print \$7}'" 2>/dev/null || echo "0")
if [ "$FREE_MB" -lt 1024 ]; then
  echo "WARNING (${FREE_MB}MB free — builds may OOM)"
else
  echo "OK (${FREE_MB}MB available)"
fi

echo ""
echo "=== Phase 1: Generate secrets (if not already set) ==="

remote_env_value() {
  local key="$1"
  local raw
  raw="$(ssh $SSH_OPTS "${SERVER}" "if [ -f '${REMOTE_DIR}/.env' ]; then sed -n \"s/^${key}=//p\" '${REMOTE_DIR}/.env' | tail -n1; fi" 2>/dev/null || true)"
  raw="${raw%\"}"
  raw="${raw#\"}"
  raw="${raw%\'}"
  raw="${raw#\'}"
  printf '%s' "$raw"
}

looks_like_legacy_hatchet_secret() {
  local value="${1:-}"
  [[ -n "$value" && "$value" =~ ^[0-9a-fA-F]{64}$ ]]
}

generate_hatchet_keysets() {
  local key_dir
  key_dir="$(mktemp -d)"

  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "${key_dir}:/hatchet/keys" \
    ghcr.io/hatchet-dev/hatchet/hatchet-admin:latest \
    /hatchet/hatchet-admin keyset create-local-keys --key-dir /hatchet/keys >/dev/null

  HATCHET_MASTER_ENCRYPTION_KEY="$(tr -d '\r\n' < "${key_dir}/master.key")"
  HATCHET_JWT_SECRET="$(tr -d '\r\n' < "${key_dir}/private_ec256.key")"
  HATCHET_JWT_PUBLIC_KEYSET="$(tr -d '\r\n' < "${key_dir}/public_ec256.key")"

  rm -rf "${key_dir}"
}

if [ -z "${RECODER_A2A_SHARED_SECRET:-}" ]; then
  RECODER_A2A_SHARED_SECRET="$(remote_env_value RECODER_A2A_SHARED_SECRET)"
fi
if [ -z "${RECODER_A2A_WORKER_TOKEN:-}" ]; then
  RECODER_A2A_WORKER_TOKEN="$(remote_env_value RECODER_A2A_WORKER_TOKEN)"
fi
if [ -z "${REDIS_PASSWORD:-}" ]; then
  REDIS_PASSWORD="$(remote_env_value REDIS_PASSWORD)"
fi
if [ -z "${HATCHET_COOKIE_SECRETS:-}" ]; then
  HATCHET_COOKIE_SECRETS="$(remote_env_value HATCHET_COOKIE_SECRETS)"
fi
if [ -z "${HATCHET_MASTER_ENCRYPTION_KEY:-}" ]; then
  HATCHET_MASTER_ENCRYPTION_KEY="$(remote_env_value HATCHET_MASTER_ENCRYPTION_KEY)"
fi
if [ -z "${HATCHET_JWT_SECRET:-}" ]; then
  HATCHET_JWT_SECRET="$(remote_env_value HATCHET_JWT_SECRET)"
fi
if [ -z "${HATCHET_JWT_PUBLIC_KEYSET:-}" ]; then
  HATCHET_JWT_PUBLIC_KEYSET="$(remote_env_value HATCHET_JWT_PUBLIC_KEYSET)"
fi
if [[ -n "${HATCHET_COOKIE_SECRETS:-}" && "${HATCHET_COOKIE_SECRETS}" == *,* && "${HATCHET_COOKIE_SECRETS}" != *" "* ]]; then
  HATCHET_COOKIE_SECRETS="${HATCHET_COOKIE_SECRETS//,/ }"
fi
if looks_like_legacy_hatchet_secret "${HATCHET_MASTER_ENCRYPTION_KEY:-}" || looks_like_legacy_hatchet_secret "${HATCHET_JWT_SECRET:-}"; then
  HATCHET_MASTER_ENCRYPTION_KEY=""
  HATCHET_JWT_SECRET=""
  HATCHET_JWT_PUBLIC_KEYSET=""
fi

if [ -z "${RECODER_A2A_SHARED_SECRET:-}" ]; then
  RECODER_A2A_SHARED_SECRET=$(openssl rand -hex 32)
  echo "Generated RECODER_A2A_SHARED_SECRET"
fi

if [ -z "${RECODER_A2A_WORKER_TOKEN:-}" ]; then
  RECODER_A2A_WORKER_TOKEN=$(openssl rand -hex 32)
  echo "Generated RECODER_A2A_WORKER_TOKEN"
fi

if [ -z "${REDIS_PASSWORD:-}" ]; then
  REDIS_PASSWORD=$(openssl rand -hex 24)
  echo "Generated REDIS_PASSWORD"
fi
if [ -z "${HATCHET_COOKIE_SECRETS:-}" ]; then
  HATCHET_COOKIE_SECRETS="$(openssl rand -hex 32) $(openssl rand -hex 32)"
  echo "Generated HATCHET_COOKIE_SECRETS"
fi
if [ -z "${HATCHET_MASTER_ENCRYPTION_KEY:-}" ] || [ -z "${HATCHET_JWT_SECRET:-}" ] || [ -z "${HATCHET_JWT_PUBLIC_KEYSET:-}" ]; then
  generate_hatchet_keysets
  echo "Generated Hatchet encryption keysets"
fi

echo "=== Phase 1b: Validate generated secrets ==="
missing_vars=0
for var_name in RECODER_A2A_SHARED_SECRET RECODER_A2A_WORKER_TOKEN REDIS_PASSWORD HATCHET_COOKIE_SECRETS HATCHET_MASTER_ENCRYPTION_KEY HATCHET_JWT_SECRET HATCHET_JWT_PUBLIC_KEYSET; do
  eval val="\${${var_name}:-}"
  if [ -z "$val" ]; then
    echo "FATAL: ${var_name} is empty after generation phase"
    missing_vars=1
  fi
done
if [ "$missing_vars" -eq 1 ]; then
  echo "Cannot proceed — secret generation failed."
  exit 1
fi
echo "All Hatchet and platform secrets validated."

echo "=== Phase 2: Sync code to server ==="

LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

# Tag current state on the remote server for rollback before overwriting
echo "Creating pre-deploy git tag on server..."
ssh_cmd "cd ${REMOTE_DIR} && git tag -f \"pre-deploy-\$(date +%Y%m%d-%H%M%S)\" || true" 2>/dev/null || true

rsync -az --timeout=120 --progress \
  --exclude='node_modules' --exclude='.git' \
  --exclude='/.beads' --exclude='/.playwright-mcp' \
  --exclude='/.env*' \
  --exclude='**/.env*' \
  --exclude='/*.png' \
  --exclude='.next' --exclude='.turbo' --exclude='coverage' \
  --exclude='.aitimemachine' --exclude='.claude' --exclude='.codex' \
  --exclude='*.log' --exclude='logs' \
  --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.cache' --exclude='.parcel-cache' --exclude='.swc' \
  --exclude='*.mp4' --exclude='*.mov' --exclude='*.zip' --exclude='*.tar.gz' \
  --exclude='docker-backend/data' --exclude='docker-backend/data/***' \
  --exclude='apps/mobile' \
  --include='packages/*/dist/***' --include='shared/dist/***' \
  --exclude='recoder-web/dist' \
  --exclude='app/dist' \
  -e "ssh ${SSH_OPTS}" \
  ./ "${SERVER}:${REMOTE_DIR}/"

echo "=== Phase 3: Write .env and upload remote build script ==="

ssh_cmd bash -s <<ENDSSH
set -euo pipefail
cd "${REMOTE_DIR}"

# Keep deploy-only/local runtime artifacts out of the tracked server checkout.
git restore --source=HEAD --worktree -- docker-backend/data >/dev/null 2>&1 || true
rm -rf .playwright-mcp
find . -maxdepth 1 -type f -name '*.png' -delete

# Write the deploy .env with shared secrets
cat > .env <<'INNEREOF'
REDIS_PASSWORD=${REDIS_PASSWORD}
RECODER_A2A_SHARED_SECRET=${RECODER_A2A_SHARED_SECRET}
RECODER_A2A_WORKER_TOKEN=${RECODER_A2A_WORKER_TOKEN}
HATCHET_COOKIE_SECRETS="${HATCHET_COOKIE_SECRETS}"
HATCHET_MASTER_ENCRYPTION_KEY=${HATCHET_MASTER_ENCRYPTION_KEY}
HATCHET_JWT_SECRET=${HATCHET_JWT_SECRET}
HATCHET_JWT_PUBLIC_KEYSET=${HATCHET_JWT_PUBLIC_KEYSET}
INNEREOF
chmod 600 .env

echo "Wrote .env with shared secrets"
ENDSSH

# Upload a self-contained build script to the server so that even if
# the SSH session drops mid-build, we can re-attach to check progress.
ssh_cmd bash -c "cat > ${REMOTE_DIR}/_remote-build.sh" <<'REMOTESCRIPT'
#!/bin/bash
set -euo pipefail

# Prefer BuildKit for reliable multi-stage builds and clearer progress output.
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

LOG="/root/deploy-build.log"
exec > >(tee -a "$LOG") 2>&1

cd /root/recoder.xyz

# Validate required env files exist before building
echo "--- Validating required env files ---"
MISSING_ENV=0
for envfile in app/.env.production docker-backend/.env recoder-agents/.env.local; do
  if [ ! -f "$envfile" ]; then
    echo "FATAL: Missing required env file: $envfile"
    MISSING_ENV=1
  else
    echo "  OK: $envfile"
  fi
done
if [ "$MISSING_ENV" -eq 1 ]; then
  echo "Cannot proceed — create the missing env file(s) on the server."
  exit 1
fi

echo "--- Checking local Postgres DSNs against live Hetzner auth ---"
bash scripts/check-hetzner-db-env-drift.sh

echo "--- Checking Docker disk pressure ---"
bash scripts/check-hetzner-docker-disk-pressure.sh

echo "--- Checking docker-backend build context cleanliness ---"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TARGET_BRANCH="${DEPLOY_BRANCH:-}"
BUILD_CONTEXT_COMPARE_REF="HEAD"
if [[ -n "$TARGET_BRANCH" && "$TARGET_BRANCH" != "HEAD" ]]; then
  echo "Fetching origin/${TARGET_BRANCH} for build-context comparison (passed from deploy host)..."
  git fetch origin "$TARGET_BRANCH"
  BUILD_CONTEXT_COMPARE_REF="origin/${TARGET_BRANCH}"
elif [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "HEAD" ]]; then
  echo "Fetching origin/${CURRENT_BRANCH} for build-context comparison..."
  git fetch origin "$CURRENT_BRANCH"
  BUILD_CONTEXT_COMPARE_REF="origin/${CURRENT_BRANCH}"
fi
GIT_COMPARE_REF="$BUILD_CONTEXT_COMPARE_REF" bash scripts/check-hetzner-docker-backend-build-context.sh

echo "--- Checking docker-backend dist parity ---"
bash scripts/check-docker-backend-dist-parity.sh

# Prevent concurrent deploy runs from racing on container names.
if command -v flock >/dev/null 2>&1; then
  exec 9>/root/.deploy-build.lock
  if ! flock -n 9; then
    echo "Another deployment is currently running (lock: /root/.deploy-build.lock). Exiting."
    exit 1
  fi
fi

CONTAINER_NAMES=(
  recoder-redis
  recoder-docker-backend
  recoder-frontend
  recoder-app
)
NETWORK_NAME="recoder-network"

cleanup_named_containers() {
  for name in "${CONTAINER_NAMES[@]}"; do
    docker rm -f "$name" 2>/dev/null || true
  done
}

ensure_shared_network() {
  if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
    echo "Creating shared Docker network: ${NETWORK_NAME}"
    docker network create "${NETWORK_NAME}" >/dev/null
  fi
}

require_docker_image() {
  local image_name="$1"

  if docker image inspect "$image_name" >/dev/null 2>&1; then
    echo "Verified Docker image: ${image_name}"
    return 0
  fi

  echo "FATAL: Required Docker image missing: ${image_name}"
  exit 1
}

# Remove stale generated/legacy files that can survive rsync and break Next typecheck.
rm -rf /root/recoder.xyz/app/app/api/auth/[...nextauth].disabled || true
rm -rf /root/recoder.xyz/app/api/auth/[...nextauth].disabled || true
rm -rf /root/recoder.xyz/app/.next /root/recoder.xyz/app/app/.next || true
rm -f /root/recoder.xyz/app/tsconfig.tsbuildinfo /root/recoder.xyz/app/app/tsconfig.tsbuildinfo || true

echo "[$(date -u)] === Remote build started ==="

echo "--- Stopping existing PM2 processes (if any) ---"
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

echo "--- Stopping legacy standalone Next servers on host (if any) ---"
# Force-free port 3000 if still occupied by any non-docker process.
PORT_3000_PIDS=$(ss -ltnp 2>/dev/null | sed -n 's/.*:3000 .*users:(("\([^"]*\)",pid=\([0-9]\+\).*/\2/p' | tr '\n' ' ')
if [ -n "${PORT_3000_PIDS}" ]; then
  echo "Killing processes on :3000 -> ${PORT_3000_PIDS}"
  kill -9 ${PORT_3000_PIDS} 2>/dev/null || true
fi

echo "--- Removing rebuilt service containers ---"
# Do not run `docker compose down` here. This stack now relies on a shared
# external network, and incident recoveries have already produced a mix of
# compose-managed and manually replaced containers on that network. A full
# `down` invites stack-level network teardown and can fail on still-live
# endpoints. Remove only the service containers we actively rebuild and let
# `docker compose up` reconcile the rest in place.
cleanup_named_containers

echo "--- Ensuring shared Docker network exists ---"
ensure_shared_network

echo "--- Starting Redis ---"
docker compose -f docker-compose.deploy.yml up -d --build redis

echo "Waiting for Redis to be healthy..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.deploy.yml exec -T redis redis-cli -a "$(grep REDIS_PASSWORD .env | cut -d= -f2)" ping 2>/dev/null | grep -q PONG; then
    echo "Redis is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "WARNING: Redis health check timed out, continuing anyway..."
  fi
  sleep 2
done

echo "--- Building recoder-base workspace image ---"
docker compose -f docker-compose.deploy.yml --profile build-base build recoder-base
require_docker_image "recoder-workspace:latest"
echo "[$(date -u)] recoder-base built"

echo "--- Building docker-backend ---"
docker build -f docker-backend/Dockerfile -t recoderxyz-docker-backend:latest .
echo "[$(date -u)] docker-backend built"

echo "--- Building recoder-app ---"
docker build -f app/Dockerfile -t recoderxyz-recoder-app:latest .
echo "[$(date -u)] recoder-app built"

echo "--- Building recoder-frontend ---"
docker build \
  -f recoder-agents/Dockerfile \
  -t recoderxyz-recoder-frontend:latest \
  --build-arg APP_PORT=3001 \
  --build-arg PNPM_LOCKFILE_MODE=--no-frozen-lockfile \
  .
echo "[$(date -u)] recoder-frontend built"

echo "--- Starting all services ---"
# Re-run explicit cleanup right before startup to avoid stale-name conflicts.
cleanup_named_containers
if ! docker compose -f docker-compose.deploy.yml up -d --remove-orphans; then
  echo "WARN: docker compose up failed; retrying once after force-cleanup."
  cleanup_named_containers
  docker compose -f docker-compose.deploy.yml up -d --remove-orphans
fi

echo "--- Waiting for services to start ---"
sleep 10

echo "--- Waiting for service health ---"
for service in redis docker-backend recoder-frontend recoder-app; do
  for i in $(seq 1 30); do
    CID=$(docker compose -f docker-compose.deploy.yml ps -q "$service" 2>/dev/null || true)
    if [ -n "$CID" ]; then
      STATUS=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CID" 2>/dev/null || true)
      if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "running" ]; then
        break
      fi
    fi
    if [ "$i" -eq 30 ]; then
      echo "WARNING: ${service} did not become healthy in time (status=${STATUS:-unknown})"
    fi
    sleep 2
  done
done

echo "=== Service Status ==="
docker compose -f docker-compose.deploy.yml ps

echo "[$(date -u)] === Remote build finished ==="
# Write a sentinel file so we can detect completion
echo "DONE" > /root/.deploy-build-done
REMOTESCRIPT

ssh_cmd chmod +x "${REMOTE_DIR}/_remote-build.sh"

echo "=== Phase 4: Build and start services (runs on server via nohup) ==="

# Remove previous sentinel
ssh_cmd "rm -f /root/.deploy-build-done /root/deploy-build.log"

# Launch the build in a nohup session so it survives SSH drops
if [ -n "${LOCAL_BRANCH:-}" ] && [ "${LOCAL_BRANCH}" != "HEAD" ]; then
  ssh_cmd "nohup env DEPLOY_BRANCH=${LOCAL_BRANCH} ${REMOTE_DIR}/_remote-build.sh > /dev/null 2>&1 &"
else
  ssh_cmd "nohup ${REMOTE_DIR}/_remote-build.sh > /dev/null 2>&1 &"
fi
echo "Build launched on server. Tailing logs..."

# Poll the log and wait for completion, reconnecting if SSH drops
POLL_INTERVAL=15
MAX_WAIT=1800  # 30 minutes
ELAPSED=0

while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))

  # Check if build is done
  if ssh $SSH_OPTS "${SERVER}" "test -f /root/.deploy-build-done" 2>/dev/null; then
    echo ""
    echo "Build completed! Fetching full log..."
    ssh_cmd "cat /root/deploy-build.log" 2>/dev/null || true
    # Check build log for error messages
    if ssh $SSH_OPTS "${SERVER}" "grep -qi 'error\|fatal\|failed' /root/deploy-build.log 2>/dev/null"; then
      echo "WARNING: Build log contains error messages - review /root/deploy-build.log"
    fi
    break
  fi

  # Show recent log output (ignore SSH errors - just retry next loop)
  RECENT=$(ssh $SSH_OPTS "${SERVER}" "tail -3 /root/deploy-build.log 2>/dev/null" 2>/dev/null || echo "(waiting for connection...)")
  echo "[${ELAPSED}s] ${RECENT}"
done

if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
  echo "WARNING: Build timed out after ${MAX_WAIT}s. Check server manually:"
  echo "  ssh ${SERVER} tail -50 /root/deploy-build.log"
  exit 1
fi

echo "=== Phase 5: Verify services ==="

ssh_retry 3 10 bash -s <<'ENDSSH'
set -euo pipefail
cd /root/recoder.xyz
echo ""
echo "=== Verification ==="

FAILED_SERVICES=""
PASSED_SERVICES=""

check_service() {
  local name="$1"
  shift
  echo -n "${name}: "
  if "$@" >/dev/null 2>&1; then
    echo "OK"
    PASSED_SERVICES="${PASSED_SERVICES} ${name}"
  else
    echo "FAIL"
    FAILED_SERVICES="${FAILED_SERVICES} ${name}"
  fi
}

check_service "docker-backend(:3100)" curl -sf http://localhost:3100/health
check_service "recoder-app(:3000)" curl -sf http://localhost:3000/api/health
check_service "recoder-frontend(:3001)" curl -sf -o /dev/null -w "%{http_code}" http://localhost:3001

echo -n "Redis ping: "
if docker compose -f docker-compose.deploy.yml exec -T redis redis-cli -a "$(grep REDIS_PASSWORD .env | cut -d= -f2)" ping 2>/dev/null | grep -q PONG; then
  echo "OK"
  PASSED_SERVICES="${PASSED_SERVICES} Redis"
else
  echo "FAIL"
  FAILED_SERVICES="${FAILED_SERVICES} Redis"
fi

echo ""
echo "=== Health Check Summary ==="
echo "PASSED:${PASSED_SERVICES:-" (none)"}"
echo "FAILED:${FAILED_SERVICES:-" (none)"}"

if [ -n "$FAILED_SERVICES" ]; then
  echo "DEPLOY INCOMPLETE: Some services are unhealthy"
  exit 1
fi
ENDSSH

echo "=== Phase 6: Start A2A workers ==="

ssh_retry 3 10 bash -s <<'ENDSSH'
set -euo pipefail
cd /root/recoder.xyz

if [ -x ./scripts/a2a-workers-hetzner.sh ]; then
  echo "Restarting A2A workers..."
  ./scripts/a2a-workers-hetzner.sh restart
  sleep 5
  echo "A2A worker status:"
  ./scripts/a2a-workers-hetzner.sh status || true
else
  echo "WARNING: a2a-workers-hetzner.sh not found, skipping worker startup"
fi
ENDSSH

echo "=== Phase 6b: Install A2A watchdog cron ==="

ssh_retry 3 10 bash -s <<'ENDSSH'
set -euo pipefail
cd /root/recoder.xyz

if [ -x ./scripts/install-a2a-watchdog-cron.sh ]; then
  ./scripts/install-a2a-watchdog-cron.sh
  echo "Current cron entries:"
  crontab -l | grep -E 'recoder-a2a-worker-watchdog|a2a-worker-watchdog' || true
else
  echo "WARNING: install-a2a-watchdog-cron.sh not found, skipping watchdog install"
fi
ENDSSH

echo "=== Phase 7: A2A production smoke test ==="

ssh_retry 3 10 bash -s <<'ENDSSH'
set -euo pipefail
cd /root/recoder.xyz

if [ -x ./scripts/a2a-production-smoke.sh ]; then
  BACKEND_URL=http://localhost:3100 ./scripts/a2a-production-smoke.sh
else
  echo "WARNING: a2a-production-smoke.sh not found, skipping smoke test"
fi
ENDSSH

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Services:"
echo "  docker-backend:    http://77.42.23.19:3100"
echo "  recoder-frontend:  http://77.42.23.19:3001"
echo ""
echo "A2A Secrets (save these):"
echo "  RECODER_A2A_SHARED_SECRET=${RECODER_A2A_SHARED_SECRET}"
echo "  RECODER_A2A_WORKER_TOKEN=${RECODER_A2A_WORKER_TOKEN}"
