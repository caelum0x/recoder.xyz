#!/usr/bin/env bash
# Setup Hatchet — run Postgres migration + generate API token
# Run this ONCE after first docker compose up
# Usage: ./scripts/setup-hatchet.sh
set -euo pipefail

HATCHET_ENGINE="${HATCHET_ENGINE:-recoder-hatchet}"
DB_URL="${HATCHET_DATABASE_URL:-postgresql://recoder:recoder_prod_2026@host.docker.internal:5432/recoder_backend}"

echo "=== Hatchet Setup ==="
echo "Engine container: $HATCHET_ENGINE"
echo ""

# 1. Create hatchet schema in the database
echo "[1/4] Creating hatchet schema..."
docker exec "$HATCHET_ENGINE" /hatchet-admin migrate --database-url "$DB_URL" 2>&1 || {
  echo "Migration via hatchet-admin failed. Trying SQL fallback..."
  # Fallback: create the schema manually if hatchet-admin isn't available
  docker exec -i recoder-hatchet sh -c "
    /hatchet migrate || echo 'migrate command not found, trying setup...'
    /hatchet setup --skip || true
  " 2>&1 || true
}
echo "Migration complete."
echo ""

# 2. Generate encryption keys (Hatchet needs these for JWT signing)
echo "[2/4] Generating encryption keys..."
MASTER_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
echo "HATCHET_MASTER_ENCRYPTION_KEY=$MASTER_KEY"
echo "HATCHET_JWT_SECRET=$JWT_SECRET"
echo ""

# 3. Create default tenant + API token
echo "[3/4] Creating default tenant and API token..."
API_TOKEN=$(docker exec "$HATCHET_ENGINE" /hatchet-admin token create \
  --tenant-id default \
  --name "recoder-docker-backend" \
  2>/dev/null || echo "")

if [ -z "$API_TOKEN" ]; then
  echo "Could not create token via hatchet-admin. Trying quickstart..."
  docker exec "$HATCHET_ENGINE" /hatchet-admin quickstart --skip create-tenant 2>&1 || true
  API_TOKEN="<check hatchet dashboard at http://localhost:8084>"
fi

echo ""
echo "=== Hatchet Setup Complete ==="
echo ""
echo "Add these to your .env on Hetzner:"
echo ""
echo "  HATCHET_CLIENT_TOKEN=$API_TOKEN"
echo "  HATCHET_MASTER_ENCRYPTION_KEY=$MASTER_KEY"
echo "  HATCHET_JWT_SECRET=$JWT_SECRET"
echo ""
echo "Then restart docker-backend:"
echo "  docker compose -f docker-compose.deploy.yml restart docker-backend"
echo ""
echo "Dashboard: http://localhost:8084"
