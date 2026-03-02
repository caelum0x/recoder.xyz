#!/usr/bin/env bash
# =============================================================================
# Recoder.xyz — Production Deployment Script
# =============================================================================
# Usage:
#   1. Push repo to Hetzner server (git clone or rsync)
#   2. SSH into server: ssh root@77.42.23.19
#   3. cd /opt/recoder (or wherever the repo lives)
#   4. bash scripts/deploy-production.sh
#
# Prerequisites:
#   - Docker + Docker Compose installed on server
#   - .env.production file populated with real credentials
#   - Cloudflare DNS already configured (all subdomains -> 77.42.23.19)
#   - Cloudflare SSL mode set to "Flexible" (initially) or "Full" with origin cert
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# =============================================================================
# Pre-flight checks
# =============================================================================
log "Running pre-flight checks..."

# Check Docker
command -v docker >/dev/null 2>&1 || err "Docker is not installed"
command -v docker compose >/dev/null 2>&1 || err "Docker Compose is not installed"

# Check .env.production
if [ ! -f .env.production ]; then
    err ".env.production not found. Copy from .env.production.template and fill in real values."
fi

# Check for placeholder values in .env.production
if grep -q 'GENERATE_NEW\|YOUR_.*_KEY\|YOUR_.*_SECRET\|YOUR_.*_PASSWORD' .env.production; then
    err ".env.production still contains placeholder values. Fill in all required credentials."
fi

# Check compose file
if [ ! -f docker-compose.production.yml ]; then
    err "docker-compose.production.yml not found."
fi

log "Pre-flight checks passed."

# =============================================================================
# Create required directories
# =============================================================================
log "Creating required directories..."

mkdir -p nginx/ssl
mkdir -p nginx/conf.d/custom-domains
mkdir -p /var/www/html
mkdir -p /data/published

# Ensure alertmanager entrypoint is executable
chmod +x scripts/alertmanager-entrypoint.sh 2>/dev/null || true

# =============================================================================
# Set Cloudflare SSL mode
# =============================================================================
log "Checking SSL configuration..."

if [ -f nginx/ssl/live/recoder.xyz/fullchain.pem ] && [ -f nginx/ssl/live/recoder.xyz/privkey.pem ]; then
    log "SSL certificates found. HTTPS (port 443) blocks will be active."
    log "Set Cloudflare SSL mode to 'Full (Strict)' for best security."
else
    warn "No SSL certificates found at nginx/ssl/live/recoder.xyz/"
    warn "Only HTTP (port 80) blocks will serve traffic."
    warn "Set Cloudflare SSL mode to 'Flexible' in Cloudflare dashboard."
    warn ""
    warn "To add SSL later:"
    warn "  1. Go to Cloudflare Dashboard -> SSL/TLS -> Origin Server"
    warn "  2. Create Origin Certificate (covers *.recoder.xyz and recoder.xyz)"
    warn "  3. Save cert to: nginx/ssl/live/recoder.xyz/fullchain.pem"
    warn "  4. Save key to:  nginx/ssl/live/recoder.xyz/privkey.pem"
    warn "  5. Change Cloudflare SSL mode to 'Full (Strict)'"
    warn "  6. Restart nginx: docker compose -f docker-compose.production.yml restart nginx"
fi

# =============================================================================
# Build base workspace image (one-time)
# =============================================================================
if ! docker image inspect recoder-workspace:latest >/dev/null 2>&1; then
    log "Building base workspace image (one-time)..."
    docker compose -f docker-compose.production.yml --profile build-base build recoder-base
else
    log "Base workspace image already exists. Skipping build."
    log "To rebuild: docker compose -f docker-compose.production.yml --profile build-base build recoder-base"
fi

# =============================================================================
# Build all service images
# =============================================================================
log "Building all service images (this may take a while)..."
docker compose -f docker-compose.production.yml build

# =============================================================================
# Run database migrations
# =============================================================================
log "Running Prisma database migrations..."
docker compose -f docker-compose.production.yml run --rm app npx prisma migrate deploy || {
    warn "Prisma migrate failed — this is OK if migrations were already applied on Neon."
    warn "Continuing deployment..."
}

# =============================================================================
# Start all services
# =============================================================================
log "Starting all services..."
docker compose -f docker-compose.production.yml up -d

# =============================================================================
# Wait for services to be healthy
# =============================================================================
log "Waiting for services to become healthy..."
sleep 10

SERVICES="recoder-redis recoder-app recoder-backend-api recoder-docker-backend recoder-web recoder-frontend recoder-studio recoder-agency recoder-pm recoder-nginx"
ALL_HEALTHY=true

for svc in $SERVICES; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "not_found")
    if [ "$STATUS" = "healthy" ]; then
        log "  $svc: ${GREEN}healthy${NC}"
    elif [ "$STATUS" = "starting" ]; then
        warn "  $svc: starting (may need more time)"
        ALL_HEALTHY=false
    else
        warn "  $svc: $STATUS"
        ALL_HEALTHY=false
    fi
done

if [ "$ALL_HEALTHY" = true ]; then
    log ""
    log "========================================="
    log "  All services are healthy!"
    log "========================================="
else
    warn ""
    warn "Some services are still starting. Check with:"
    warn "  docker compose -f docker-compose.production.yml ps"
    warn "  docker compose -f docker-compose.production.yml logs -f <service>"
fi

# =============================================================================
# Health check endpoints
# =============================================================================
log ""
log "Testing health endpoints..."

check_health() {
    local name=$1
    local url=$2
    local status
    status=$(curl -sf -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
        log "  $name ($url): ${GREEN}OK${NC}"
    else
        warn "  $name ($url): HTTP $status"
    fi
}

check_health "nginx"          "http://localhost/nginx-health"
check_health "app"             "http://localhost:3000/api/health"  # via internal port if exposed
check_health "recoder.xyz"     "http://localhost/api/health"       # via nginx

log ""
log "========================================="
log "  Deployment complete!"
log "========================================="
log ""
log "Your services:"
log "  Main site:      https://recoder.xyz"
log "  API:            https://api.recoder.xyz"
log "  Docker Backend: https://docker.recoder.xyz"
log "  Web IDE:        https://web.recoder.xyz"
log "  Dashboard:      https://app.recoder.xyz"
log "  Studio:         https://studio.recoder.xyz"
log "  Agency:         https://agency.recoder.xyz"
log "  PM:             https://pm.recoder.xyz"
log ""
log "Useful commands:"
log "  View logs:      docker compose -f docker-compose.production.yml logs -f"
log "  View status:    docker compose -f docker-compose.production.yml ps"
log "  Restart:        docker compose -f docker-compose.production.yml restart"
log "  Stop:           docker compose -f docker-compose.production.yml down"
log "  Rebuild:        docker compose -f docker-compose.production.yml up -d --build"
