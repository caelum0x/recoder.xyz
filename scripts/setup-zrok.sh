#!/usr/bin/env bash
# Setup Zrok — bootstrap controller + generate admin token + create environment
# Run this ONCE after first docker compose up
# Usage: ./scripts/setup-zrok.sh
#
# Prerequisites:
#   1. Cloudflare DNS: *.preview.recoder.xyz → 77.42.23.19
#   2. nginx http{} includes preview wildcard proxy → http://127.0.0.1:8080
#   3. HTTPS requires certificate coverage for *.preview.recoder.xyz
#      (for example a Cloudflare edge/origin certificate or a wildcard LE cert)
set -euo pipefail

ZROK_CONTAINER="${ZROK_CONTAINER:-recoder-zrok}"
ZROK_ADMIN_TOKEN="${ZROK_ADMIN_TOKEN:-$(openssl rand -hex 16)}"
ZROK_FRONTEND_CONTAINER="${ZROK_FRONTEND_CONTAINER:-recoder-zrok-frontend}"

echo "=== Zrok Setup ==="
echo "Controller: $ZROK_CONTAINER"
echo ""

# 1. Generate a minimal controller config if not present
echo "[1/5] Generating controller config..."
docker exec "$ZROK_CONTAINER" sh -c "
mkdir -p /etc/zrok
cat > /etc/zrok/ctrl.yml << 'ZROKEOF'
v: 4
admin:
  secrets:
    - $ZROK_ADMIN_TOKEN
endpoint:
  host: 0.0.0.0
  port: 18080
store:
  path: /var/lib/zrok/zrok.db
  type: sqlite3
metrics:
  agent:
    source:
      type: websocket
ZROKEOF
echo 'Config written to /etc/zrok/ctrl.yml'
" 2>&1

echo ""

# 2. Bootstrap the controller (creates DB, identities, policies)
echo "[2/5] Bootstrapping Zrok controller..."
docker exec -e ZROK_ADMIN_TOKEN="$ZROK_ADMIN_TOKEN" "$ZROK_CONTAINER" \
  zrok admin bootstrap /etc/zrok/ctrl.yml 2>&1 || {
    echo "Bootstrap may have already been run (OK if 'already bootstrapped')"
  }
echo ""

# 3. Create a service account for docker-backend
echo "[3/5] Creating docker-backend service account..."
ZROK_TOKEN=$(docker exec -e ZROK_ADMIN_TOKEN="$ZROK_ADMIN_TOKEN" "$ZROK_CONTAINER" \
  zrok admin create account \
    --email "docker-backend@recoder.xyz" \
    --password "$(openssl rand -hex 16)" \
  2>/dev/null | grep -oP 'token:\s*\K\S+' || echo "")

if [ -z "$ZROK_TOKEN" ]; then
  echo "Account creation via CLI failed. Generating token manually..."
  ZROK_TOKEN="zrok_$(openssl rand -hex 20)"
  echo "Manual token: $ZROK_TOKEN (add to controller DB manually or use web console)"
fi
echo ""

# 4. Enable the environment for docker-backend
echo "[4/5] Enabling environment..."
docker exec -e ZROK_TOKEN="$ZROK_TOKEN" "$ZROK_CONTAINER" \
  zrok enable --headless --description "recoder-docker-backend" 2>&1 || {
    echo "Environment enable failed (may need manual setup via web console)"
  }
echo ""

# 5. Generate nginx config snippet
echo "[5/5] Generating nginx config..."
cat << 'NGINXEOF'

# Add these inside the http {} block of nginx/nginx-production.conf.
# HTTP routing works immediately once wildcard DNS exists.
server {
    listen 80;
    server_name *.preview.recoder.xyz;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;
        proxy_read_timeout 86400;
    }
}

# Optional HTTPS block once *.preview.recoder.xyz certificate coverage exists.
server {
    listen 443 ssl http2;
    server_name *.preview.recoder.xyz;

    ssl_certificate /etc/nginx/ssl/recoder.crt;
    ssl_certificate_key /etc/nginx/ssl/recoder.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;
        proxy_read_timeout 86400;
    }
}
NGINXEOF

echo ""
echo "=== Zrok Setup Complete ==="
echo ""
echo "Add these to your Hetzner .env:"
echo ""
echo "  ZROK_ADMIN_TOKEN=$ZROK_ADMIN_TOKEN"
echo "  ZROK_TOKEN=$ZROK_TOKEN"
echo "  ZROK_FRONTEND=preview.recoder.xyz"
echo ""
echo "Cloudflare DNS needed:"
echo "  *.preview.recoder.xyz → A → 77.42.23.19"
echo ""
echo "Cloudflare / TLS needed for public HTTPS:"
echo "  - edge certificate coverage for *.preview.recoder.xyz"
echo "  - origin certificate coverage for *.preview.recoder.xyz if using Full (Strict)"
echo ""
echo "Then restart docker-backend + zrok:"
echo "  docker compose -f docker-compose.deploy.yml restart docker-backend zrok-controller zrok-frontend"
echo ""
echo "Web console: http://localhost:18080"
