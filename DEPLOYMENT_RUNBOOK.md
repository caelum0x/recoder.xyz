# Recoder Platform — Server Deployment Runbook

Canonical deployment path:
- Use `bash scripts/deploy-all-services.sh`
- Supported production compose manifest: `docker-compose.deploy.yml`
- `deploy.sh` and `scripts/deploy-production.sh` are deprecated and should not be used for production

**Server**: Hetzner 8 vCPU, 16GB RAM, 150GB disk
**IP**: 77.42.23.19
**SSH**: `ssh root@77.42.23.19`
**Repo**: `/root/recoder.xyz`

---

## 1. SECRET ROTATION (P0 — Do First)

All secrets below were previously committed to git and must be rotated.

### 1.1 Generate New Secrets

```bash
# Generate strong random secrets (run locally or on server)
openssl rand -hex 32  # For BETTER_AUTH_SECRET
openssl rand -hex 32  # For NEXTAUTH_SECRET
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For REDIS_PASSWORD
openssl rand -hex 32  # For SESSION_SYNC_SECRET
openssl rand -hex 32  # For INTERNAL_SERVICE_KEY
```

### 1.2 Rotate Third-Party Keys

These were exposed in git history and must be rotated at each provider:

| Provider | Dashboard | What to Rotate |
|----------|-----------|---------------|
| GitHub OAuth | github.com/settings/developers | Client Secret |
| Google OAuth | console.cloud.google.com/apis/credentials | Client Secret |
| Resend | resend.com/api-keys | API Key |
| OpenRouter | openrouter.ai/keys | API Key |
| Anthropic | console.anthropic.com/settings/keys | API Key |
| OpenAI | platform.openai.com/api-keys | API Key |
| Neon PostgreSQL | console.neon.tech | Connection password (reset role password) |

### 1.3 Update Server Env Files

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz

# Edit the main app env
nano app/.env

# Update these vars with new values:
# BETTER_AUTH_SECRET=<new-secret>
# NEXTAUTH_SECRET=<new-secret>
# JWT_SECRET=<new-secret>
# GITHUB_CLIENT_SECRET=<rotated>
# GOOGLE_CLIENT_SECRET=<rotated>
# RESEND_API_KEY=<rotated>
# OPENROUTER_API_KEY=<rotated>
# ANTHROPIC_API_KEY=<rotated>
# INTERNAL_SERVICE_KEY=<new-secret>
# SESSION_SYNC_SECRET=<new-secret>

# Update redis password
nano docker-compose.deploy.yml
# Set REDIS_PASSWORD env var (or create .env at root with REDIS_PASSWORD=<new>)

# Restart all services
pm2 restart all
docker compose -f docker-compose.deploy.yml up -d
```

### 1.4 Purge Git History (Optional but Recommended)

```bash
# Install BFG Repo-Cleaner
brew install bfg  # or download from https://rtyley.github.io/bfg-repo-cleaner/

# Create backup first
git clone --mirror git@github.com:recoder-xyz/recoder.git recoder-mirror.git

# Remove secrets from history
bfg --replace-text passwords.txt recoder-mirror.git
# passwords.txt should contain each secret value (one per line)

cd recoder-mirror.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

---

## 2. STUDIO .ENV SETUP (P1)

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz/recoder-studio

cat > .env << 'EOF'
# Recoder Studio Production Environment
NODE_ENV=production
PORT=3005

# Better Auth (shared with app)
BETTER_AUTH_URL=https://recoder.xyz
BETTER_AUTH_SECRET=<same-as-app-BETTER_AUTH_SECRET>

# Database (same Neon instance as app)
DATABASE_URL=<same-as-app-DATABASE_URL>

# Cookie/Session
COOKIE_SECRET=<generate-with-openssl-rand-hex-32>
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-32>

# Optional: Sentry
NEXT_PUBLIC_SENTRY_DSN=<your-sentry-dsn>
EOF

pm2 restart recoder-studio
```

---

## 3. DODOPAYMENTS SETUP (P2)

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz

# Add to app/.env:
echo 'DODO_PAYMENTS_API_KEY=<your-dodo-api-key>' >> app/.env
echo 'DODO_PAYMENTS_WEBHOOK_KEY=<your-dodo-webhook-key>' >> app/.env

# The webhook endpoint is already implemented at:
# app/app/api/webhooks/dodopayments/route.ts

pm2 restart recoder-app
```

---

## 4. SENTRY SETUP (P2)

### 4.1 Create Sentry Project

1. Go to https://sentry.io and create a free account
2. Create project: "recoder" (Next.js platform)
3. Copy the DSN (format: `https://abc123@oXXXXXX.ingest.sentry.io/XXXXXXX`)

### 4.2 Set DSN on All Services

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz

SENTRY_DSN="https://your-dsn@oXXXXXX.ingest.sentry.io/XXXXXXX"

# App
echo "NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN" >> app/.env

# Agents
echo "NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN" >> recoder-agents/.env.local

# Studio
echo "NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN" >> recoder-studio/.env

# Agency
echo "NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN" >> recoder-agency/.env

# Restart all PM2 services
pm2 restart all
```

---

## 5. MONITORING STACK DEPLOYMENT (P3)

### 5.1 Add to docker-compose.deploy.yml

Add these services to the existing `docker-compose.deploy.yml`:

```yaml
  prometheus:
    image: prom/prometheus:latest
    container_name: recoder-prometheus
    restart: unless-stopped
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  grafana:
    image: grafana/grafana:latest
    container_name: recoder-grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_SERVER_DOMAIN=monitor.recoder.xyz
      - GF_SERVER_ROOT_URL=https://monitor.recoder.xyz
      - GF_SECURITY_COOKIE_SECURE=true
    ports:
      - "127.0.0.1:3002:3000"
    volumes:
      - ./monitoring/grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml:ro
      - ./monitoring/grafana-dashboards.yml:/etc/grafana/provisioning/dashboards/dashboards.yml:ro
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
```

Add to volumes section:
```yaml
  prometheus-data:
  grafana-data:
```

### 5.2 Deploy

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz

# Set Grafana password
export GRAFANA_PASSWORD=$(openssl rand -hex 16)
echo "Grafana password: $GRAFANA_PASSWORD"

# Start monitoring stack
docker compose -f docker-compose.deploy.yml up -d prometheus grafana

# Verify
curl -s http://localhost:9090/-/healthy  # Prometheus
curl -s http://localhost:3002/api/health  # Grafana
```

### 5.3 Nginx already routes monitor.recoder.xyz to port 3002

The upstream `monitoring` block is already configured in `nginx/nginx-production.conf`.

---

## 6. DISK ALERTING (P3)

```bash
ssh root@77.42.23.19

# Install the alert script
chmod +x /root/recoder.xyz/monitoring/disk-alert.sh

# Add cron jobs
crontab -e

# Add these lines:
# Disk space check every 15 minutes
*/15 * * * * /root/recoder.xyz/monitoring/disk-alert.sh >> /root/recoder.xyz/logs/disk-alert.log 2>&1

# Weekly Docker cleanup (Sunday 3 AM)
0 3 * * 0 docker system prune -f --volumes 2>&1 | logger -t docker-prune

# Weekly PM2 log rotation
0 4 * * 0 pm2 flush 2>&1 | logger -t pm2-flush
```

---

## 7. AI PROVIDER KEY VERIFICATION (P2)

```bash
ssh root@77.42.23.19
cd /root/recoder.xyz

# Check which env files exist
ls -la app/.env.production recoder-agents/.env.local recoder-web/.env docker-backend/.env 2>/dev/null

# Verify key vars are set (don't print values)
for service in app recoder-agents recoder-web docker-backend; do
  echo "=== $service ==="
  env_file=".env"
  if [ "$service" = "app" ]; then env_file=".env.production"; fi
  if [ "$service" = "recoder-agents" ]; then env_file=".env.local"; fi
  if [ -f "$service/$env_file" ]; then
    grep -c 'ANTHROPIC_API_KEY' "$service/$env_file" 2>/dev/null && echo "  ANTHROPIC: set" || echo "  ANTHROPIC: MISSING"
    grep -c 'OPENROUTER_API_KEY' "$service/$env_file" 2>/dev/null && echo "  OPENROUTER: set" || echo "  OPENROUTER: MISSING"
  else
    echo "  $env_file file MISSING"
  fi
done

# Test API key validity (Anthropic)
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $(grep ANTHROPIC_API_KEY app/.env | cut -d= -f2)" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":5,"messages":[{"role":"user","content":"hi"}]}' \
  | head -c 200
```

---

## 8. OPENCLAW RESTART LOOP DEBUG (P2)

```bash
ssh root@77.42.23.19

# Check container status
docker ps -a | grep openclaw

# Check logs
docker logs openclaw-gateway --tail 50

# Common fixes:
# 1. Missing gateway token
docker exec openclaw-gateway env | grep OPENCLAW_GATEWAY_TOKEN

# 2. Port conflict
ss -tlnp | grep 18789

# 3. Rebuild from scratch
docker compose -f docker-compose.deploy.yml down openclaw-gateway
docker compose -f docker-compose.deploy.yml up -d --build openclaw-gateway
docker logs -f openclaw-gateway
```

---

## 9. POST-DEPLOYMENT VERIFICATION

Run after completing all tasks above:

```bash
ssh root@77.42.23.19

echo "=== Service Health ==="
curl -s -o /dev/null -w "recoder-app:        %{http_code}\n" https://recoder.xyz/
curl -s -o /dev/null -w "recoder-agents:      %{http_code}\n" https://agents.recoder.xyz/
curl -s -o /dev/null -w "frontend-alias:      %{http_code}\n" https://frontend.recoder.xyz/
curl -s -o /dev/null -w "recoder-backend:     %{http_code}\n" https://backend.recoder.xyz/v1/health
curl -s -o /dev/null -w "recoder-pm:          %{http_code}\n" https://pm.recoder.xyz/
curl -s -o /dev/null -w "recoder-studio:      %{http_code}\n" https://studio.recoder.xyz/
curl -s -o /dev/null -w "recoder-agency:      %{http_code}\n" https://agency.recoder.xyz/
curl -s -o /dev/null -w "docker-backend:      %{http_code}\n" https://api.recoder.xyz/health
curl -s -o /dev/null -w "recoder-web:         %{http_code}\n" https://web.recoder.xyz/
curl -s -o /dev/null -w "openclaw:            %{http_code}\n" https://openclaw.recoder.xyz/health
curl -s -o /dev/null -w "monitoring:          %{http_code}\n" https://monitor.recoder.xyz/

echo ""
echo "=== Disk Usage ==="
df -h / | tail -1

echo ""
echo "=== Memory Usage ==="
free -h | head -2

echo ""
echo "=== Docker Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== PM2 Status ==="
pm2 list
```
