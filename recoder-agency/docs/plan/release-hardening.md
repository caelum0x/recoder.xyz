# Recoder Agency — Release Hardening Plan

7 areas to harden before production release. Prioritized by blast radius.

## Phase 1: Critical (blocks production)

### 1. Docker/Deploy Readiness

**Current:** Multi-stage Dockerfile with standalone Next.js output, non-root user. No healthcheck, no compose, no .dockerignore.

**Actions:**
- [x] Add `HEALTHCHECK` instruction to Dockerfile (`/api/health` endpoint)
- [x] Create `/api/health` route that validates DB connectivity
- [x] Create `.dockerignore` (exclude `.git`, `node_modules`, tests, docs)
- [x] Pin base image to digest (`node:24-alpine@sha256:...`)
- [x] Create `docker-compose.yml` for local dev (app + postgres)
- [ ] Create `docker-compose.staging.yml` for CI/staging
- [x] Add graceful shutdown handler (SIGTERM)

### 2. Security Headers

**Current:** `X-Frame-Options`, `X-XSS-Protection`, `X-Content-Type-Options`, `Referrer-Policy` set in `next.config.ts`. No CSP, no HSTS.

**Actions:**
- [x] Add `Content-Security-Policy` header in `next.config.ts`
- [x] Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- [x] Add `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [x] Add rate limiting middleware for `/api/agency/cron/*` endpoints
- [x] Add request body size limits on API routes

### 3. Sentry Client-Side

**Current:** Server-side Sentry configured (`sentry.server.config.ts`, `sentry.edge.config.ts`). DSN hardcoded. No client-side, no error boundary, no release tracking.

**Actions:**
- [x] Move DSN to `NEXT_PUBLIC_SENTRY_DSN` env var
- [x] Create `sentry.client.config.ts` for browser error tracking
- [x] `app/global-error.tsx` already exists (captures to Sentry)
- [x] Add `SENTRY_RELEASE` env var (git SHA or build ID)
- [ ] Configure source map upload in build pipeline

## Phase 2: High (blocks reliability)

### 4. CI Deploy Gates

**Current:** Comprehensive CI (`ci.yml`, `deploy-gate.yml`) with lint, typecheck, tests, DB guardrails, smoke tests. No secret scanning, no health checks post-deploy, no promotion gates.

**Actions:**
- [ ] Enable GitHub native secret scanning
- [x] Add post-deployment health check step to deploy-gate workflow
- [x] Add container image scanning (trivy) to CI
- [x] Create staging → production promotion workflow with approval gate
- [x] Add SBOM generation (CycloneDX)

### 5. Runbooks — Gap Fill

**Current:** 4 runbooks exist (security checklist, delivery rollout, delivery staging, role matrix). No incident response, no troubleshooting, no DR.

**Actions:**
- [x] Create `docs/runbooks/incident-response.md` — response playbook for common failures
- [x] Create `docs/runbooks/production-troubleshooting.md` — debugging guide, log locations
- [x] Create `docs/runbooks/monitoring-and-alerts.md` — KPIs, alert thresholds, escalation
- [x] Create `docs/runbooks/disaster-recovery.md` — RTO/RPO targets, full restore procedures
- [x] Create `docs/runbooks/release-promotion.md` — promotion workflow and approval gate operations

## Phase 3: Medium (blocks operational maturity)

### 6. Env Validation Enhancement

**Current:** `env-validation.ts` validates `DATABASE_URL` and `BETTER_AUTH_SECRET` at startup. Warns on 3 recommended vars. Secret hygiene checks.

**Actions:**
- [ ] Add conditional validation for Stripe vars when Stripe routes are hit
- [x] Add conditional validation for Sentry vars when `SENTRY_ENABLED=true`
- [x] Add warning for database pooling URL strategy
- [x] Document which env vars are required for which features in `.env.example`

### 7. Bootstrap SQL Enhancement

**Current:** 3758-line `bootstrap.sql` auto-generated from migrations. Full schema, RBAC constraints, indexes, views. 101+ migrations.

**Actions:**
- [x] Create `db/seed.sql` for initial admin user and team
- [x] Create `db/bootstrap-validate.sql` to verify schema post-bootstrap
- [x] Add `ANALYZE` command to bootstrap-validate for query planner optimization
- [ ] Document migration rollback procedure
- [ ] Create cold-start checklist (bootstrap → seed → validate → optimize)

## Verification

After each phase:
1. `pnpm check-types` — no type errors
2. `pnpm test` — all tests pass
3. `pnpm build-sdk && pnpm -F agency build` — builds clean
4. Staging smoke test passes
5. Health check endpoint returns 200
