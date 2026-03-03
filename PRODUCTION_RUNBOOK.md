# Recoder.xyz Production Runbook

Last updated: 2026-03-03

Canonical deployment path:
- Use `bash scripts/deploy-all-services.sh`
- Supported production compose manifest: `docker-compose.deploy.yml`
- Do not use `deploy.sh` or `scripts/deploy-production.sh` for production deploys

This runbook contains the exact commands to bring the entire recoder.xyz ecosystem to production. All feature code is complete. Only config/ops steps remain.

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────┐
                    │              .recoder.xyz cookies                │
                    │          (shared Better Auth session)            │
                    └──────────┬──────────┬──────────┬────────────────┘
                               │          │          │
                    ┌──────────▼──┐  ┌────▼────┐  ┌─▼──────────┐
                    │ recoder.xyz  │  │ agency. │  │   pm.       │
                    │    (app)     │  │recoder. │  │ recoder.    │
                    │ AUTH MASTER  │  │  xyz    │  │   xyz       │
                    │ Vercel       │  │ Docker  │  │ Docker+Nginx│
                    └──────┬───┬──┘  └────┬────┘  └──┬──────────┘
                           │   │          │           │
                    ┌──────▼─┐ │    ┌─────▼──┐  ┌────▼─────┐
                    │recoder │ │    │ Drizzle │  │  Prisma  │
                    │  -web  │ │    │   PG    │  │  Neon PG │
                    │CF/Vrcl │ │    │+pgvector│  │  +MinIO  │
                    └────┬───┘ │    └─────┬──┘  └────┬─────┘
                         │     │          │           │
                    ┌────▼─────▼──┐       │           │
                    │docker-backend│       │           │
                    │   Express    │  ┌────▼───────────▼────┐
                    │Docker+Redis  │  │  App's Neon Postgres │
                    └──────────────┘  │  (shared auth tables)│
                                      └─────────────────────┘
```

**Key relationships:**
- `app` is the **auth authority** — its Postgres DB contains the Better Auth tables (`user`, `session`, `account`, `verification`).
- `recoder-agency` and `recoder-pm` connect to app's auth DB via `AUTH_DATABASE_URL`.
- All apps share the same `BETTER_AUTH_SECRET` and cookie config (prefix `recoder`, domain `.recoder.xyz`).
- `app`, `recoder-web`, and `docker-backend` share `INTERNAL_SERVICE_KEY` for HMAC-SHA256 inter-service auth.

---

## Prerequisites

- Node.js 18+, pnpm
- `openssl` (for secret generation)
- `gh` CLI (for GitHub operations)
- Network access to: Neon DB, GitHub API, DNS provider, Polar.sh

---

## Step 0: Generate All Secrets

```bash
# Generate secrets to a file
pnpm run generate:secrets secrets.env

# Or output to stdout
pnpm run generate:secrets
```

This generates all secrets needed across the ecosystem. The output tells you which secrets go where.

---

## Step 1: Shared Auth Activation

**Goal:** Enable cross-subdomain SSO across app, agency, PM.

### 1.1 Set BETTER_AUTH_SECRET (same value in all 3)

Copy the `BETTER_AUTH_SECRET` from `secrets.env` into:

```bash
# app (Vercel env vars or app/.env.production)
BETTER_AUTH_SECRET=<value>

# recoder-agency/.env.docker (or Vercel env)
BETTER_AUTH_SECRET=<value>

# recoder-pm/.env.docker
BETTER_AUTH_SECRET=<value>
```

### 1.2 Set AUTH_DATABASE_URL in agency and PM

Point both to app's Neon Postgres URL:

```bash
# recoder-agency/.env.docker
AUTH_DATABASE_URL=<AUTH_DATABASE_URL>

# recoder-pm/.env.docker
AUTH_DATABASE_URL=<AUTH_DATABASE_URL>
```

### 1.3 Set BETTER_AUTH_URL per app

```bash
# app/.env.production (or Vercel)
BETTER_AUTH_URL=https://recoder.xyz

# recoder-agency/.env.docker
BETTER_AUTH_URL=https://agency.recoder.xyz

# recoder-pm/.env.docker
BETTER_AUTH_URL=https://pm.recoder.xyz
```

### 1.4 Verify auth tables exist

Connect to app's Neon database and confirm:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user', 'session', 'account', 'verification');
```

All 4 tables must exist. If not, run the app once — Better Auth auto-creates them.

---

## Step 2: Main Branch Hardening (app + recoder-web + docker-backend)

### 2.1 Sync INTERNAL_SERVICE_KEY

```bash
# Option A: Use the sync script
pnpm run sync:internal-service-key

# Option B: Manually set the same value in:
#   app/.env.production        → INTERNAL_SERVICE_KEY=<value>
#   recoder-web/.env.local     → INTERNAL_SERVICE_KEY=<value>
#   docker-backend/.env        → INTERNAL_SERVICE_KEY=<value>
```

### 2.2 Enable Redis in docker-backend

In `docker-backend/.env`:

```bash
REDIS_URL=redis://:PASSWORD@HOST:6379/0
PUBLIC_PROMPT_TASK_QUEUE_BACKEND=redis
```

### 2.3 Set docker-backend security vars

In `docker-backend/.env`:

```bash
VAULT_MASTER_KEY=<from secrets.env>
VAULT_SALT=<from secrets.env>
API_KEY_HASH_SALT=<from secrets.env>
IDENTITY_TOKEN_SECRET=<from secrets.env>
```

### 2.4 Decide billing mode

In recoder-web's env (Vercel or `.env.local`):

```bash
# Keep disabled (safe default):
BILLING_ACTIONS_ENABLED=false

# Or enable after validating payment flow:
BILLING_ACTIONS_ENABLED=true
```

### 2.5 Run Phase 1 smoke test

```bash
BILLING_ACTIONS_ENABLED=false pnpm run smoke:phase1
```

---

## Step 3: Agency Go-Live (recoder-agency)

### 3.1 GitHub environment + secrets

```bash
# Verify auth
gh auth status

# Create production-promotion environment
gh api repos/caelum0x/recoder.xyz/environments/production-promotion -X PUT

# Set repo secrets (you'll be prompted for values)
gh secret set PRODUCTION_DEPLOY_WEBHOOK_URL --repo caelum0x/recoder.xyz
gh secret set ALERT_WEBHOOK_URL --repo caelum0x/recoder.xyz
```

### 3.2 Set Polar billing vars

In `recoder-agency/.env.docker`:

```bash
POLAR_ACCESS_TOKEN=<from Polar dashboard>
POLAR_PRO_PRODUCT_ID=<from Polar dashboard>
POLAR_WEBHOOK_SECRET=<from Polar dashboard>
POLAR_ORGANIZATION_ID=<from Polar dashboard>
```

### 3.3 Set integration vars

```bash
RECODER_WEB_URL=https://web.recoder.xyz
RECODER_WEB_API_KEY=<generated API key for agency>
```

### 3.4 Set production security vars

```bash
COOKIE_SECRET=<from secrets.env>
TOKEN_ENCRYPTION_KEY=<from secrets.env>
CRON_SECRET=<from secrets.env>
```

### 3.5 Configure Polar webhook

In the Polar.sh dashboard, set webhook endpoint to:
```
https://agency.recoder.xyz/webhooks/polar
```

Subscribe to events:
- `subscription.active`
- `subscription.canceled`
- `order.paid`

### 3.6 Apply migration 0112

```bash
# Against staging DB
DATABASE_URL=<staging-url> pnpm -C recoder-agency exec drizzle-kit push

# Against production DB
DATABASE_URL=<production-url> pnpm -C recoder-agency exec drizzle-kit push
```

### 3.7 Run staging evidence pass

```bash
pnpm -C recoder-agency run ops:staging:cleanup-weekly-metrics-fixture
pnpm -C recoder-agency run ops:staging:seed-weekly-metrics-fixture
pnpm -C recoder-agency run ops:staging:log-restore-drill
pnpm -C recoder-agency run ops:staging:assert-release-readiness
```

---

## Step 4: PM Go-Live (recoder-pm)

### 4.1 DNS records

Create these DNS records:

```
A     pm.recoder.xyz          → <server-ip>
CNAME storage.pm.recoder.xyz  → <server-ip or CDN>
```

### 4.2 Rotate MinIO password

In `recoder-pm/.env.docker`:

```bash
MINIO_ROOT_PASSWORD=<from secrets.env>
MINIO_ROOT_USER=minioadmin
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=<same as MINIO_ROOT_PASSWORD>
```

### 4.3 Set PM database

```bash
DATABASE_URL=<PM_DATABASE_URL>
POSTGRES_PRISMA_URL=<PM_DATABASE_URL_WITH_PGBOUNCER>
POSTGRES_URL_NON_POOLING=<PM_DATABASE_URL_NON_POOLING>
```

### 4.4 Set email

```bash
RESEND_API_KEY=re_<your-resend-key>
RESEND_FROM="Recoder PM <pm@recoder.xyz>"
```

### 4.5 Set PM Polar billing

```bash
POLAR_ACCESS_TOKEN=<from Polar dashboard>
POLAR_WEBHOOK_SECRET=<from Polar dashboard>
POLAR_PRODUCT_PRO_ID=<from Polar dashboard>
POLAR_PRODUCT_ENTERPRISE_ID=<from Polar dashboard>
POLAR_SERVER=production
```

### 4.6 Run database migrations

```bash
set -a; source recoder-pm/.env.docker; set +a
pnpm -C recoder-pm migrate
```

### 4.7 Start PM services

```bash
cd recoder-pm
docker compose up -d
```

Verify all containers are healthy:

```bash
docker compose ps
# Expected: redis, minio, minio-init (exited), api, app, portal, web, agency, nginx — all running
```

---

## Step 5: Verification

### 5.1 Check ecosystem readiness

```bash
pnpm run check:ecosystem
```

### 5.2 Cross-subdomain SSO test

1. Sign in at `https://recoder.xyz`
2. Open `https://agency.recoder.xyz` — should be logged in (no login prompt)
3. Open `https://pm.recoder.xyz` — should be logged in (no login prompt)

### 5.3 Health endpoints

```bash
# App
curl -sf https://recoder.xyz/api/health

# Docker backend
curl -sf https://docker.recoder.xyz/health
curl -sf https://docker.recoder.xyz/api/health/public-api-queue
curl -sf https://docker.recoder.xyz/api/health/byok-readiness

# Agency
curl -sf https://agency.recoder.xyz/api/health

# PM
curl -sf https://pm.recoder.xyz/api/health
```

### 5.4 Full AF networked run

```bash
BILLING_ACTIONS_ENABLED=false pnpm run af:networked
```

### 5.5 Phase 3 production gate + evidence

```bash
PHASE3_MODE=production \
BILLING_ACTIONS_ENABLED=false \
ENABLE_A2A_INTEROP_SMOKE=true \
pnpm run phase3:gates
```

Attach these artifacts to the promotion record:
- `logs/phase3-gates/<run-id>.log`
- `logs/phase3-gates/<run-id>-summary.md`
- `logs/phase3-gates/<run-id>-summary.json`
- `logs/phase3-gates/<run-id>-scorecard.md`
- `logs/phase3-gates/<run-id>-scorecard.json` (`ga_ready=true` required for final signoff)

Enforce final signoff and bundle artifacts:
```bash
pnpm run phase3:assert-ga-ready
pnpm run phase3:evidence-pack
```

Single-command local closeout:
```bash
pnpm run phase3:closeout
```

For local/dev rehearsal:
```bash
pnpm run phase3:closeout:dev
```

Dispatch centralized GitHub signoff run (requires valid `gh` auth):
```bash
gh auth login -h github.com
pnpm run phase3:dispatch-signoff
```

---

## Step 6: Cleanup (Non-Blocking)

```bash
# Regenerate backend lock file to remove stale supabase dep
cd backend && uv lock && cd ..

# Delete vestigial supabase directory in PM
rm -rf recoder-pm/supabase/

# Mobile lockfile refresh (needs npm registry access)
pnpm -C apps/mobile install --lockfile-only
```

---

## Quick Reference

| Domain | Service | Deploy | Status |
|---|---|---|---|
| `recoder.xyz` | app | Vercel | Running |
| `web.recoder.xyz` | recoder-web | Cloudflare/Vercel | Running |
| `docker.recoder.xyz` | docker-backend | Docker | Running |
| `agency.recoder.xyz` | recoder-agency | Docker | Config pending |
| `pm.recoder.xyz` | recoder-pm | Docker+Nginx | Config pending |
| `storage.pm.recoder.xyz` | MinIO | Docker (via PM) | Config pending |
| `monitor.recoder.xyz` | Grafana | Docker | Optional |

| Shared Secret | Services |
|---|---|
| `BETTER_AUTH_SECRET` | app, agency, PM |
| `INTERNAL_SERVICE_KEY` | app, recoder-web, docker-backend |
| `AUTH_DATABASE_URL` | agency, PM (→ app's Postgres) |

---

## Rollback

If any service breaks after config changes:

```bash
# Revert to previous env (assuming you backed up)
cp .env.backup .env
docker compose restart <service>

# Agency rollback (if promotion gate used)
gh api repos/caelum0x/recoder.xyz/deployments --jq '.[0].id'
# Then use the GitHub deployments UI to roll back

# PM rollback
cd recoder-pm && docker compose down && docker compose up -d
```

---

## Monitoring

```bash
# View all container logs
docker compose logs -f

# View specific service
docker compose logs -f agency

# PM container health
cd recoder-pm && docker compose ps

# Queue health
curl -sf https://docker.recoder.xyz/api/health/public-api-queue | jq
```
