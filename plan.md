# Recoder Unified Plan (Single Source of Truth)

| Service | URL | Status |
|---------|-----|--------|
| recoder-app | https://recoder.xyz | 200 |
| recoder-agents | https://agents.recoder.xyz | 200 |
| recoder-agents (alias) | https://frontend.recoder.xyz | 200 |
| recoder-backend | https://api.recoder.xyz | 200 |
| recoder-studio | https://studio.recoder.xyz | 200 |
| recoder-agency | https://agency.recoder.xyz | 200 |
| recoder-pm | https://pm.recoder.xyz | 200 |
| recoder-web | https://web.recoder.xyz | 302 |

Last updated: 2026-03-03

All 9 services are live on Hetzner (77.42.23.19). Platform is in beta — BYOK-only, no platform AI keys.

Deployment reality:
- Hetzner is PM2-first for user-facing apps and the main backend.
- Docker is supporting runtime infrastructure for `docker-backend`, `openclaw-gateway`, Redis, and monitoring.
- Repo-side app ownership is `recoder-agents/`; legacy `recoder-frontend` naming still exists in some compatibility surfaces.

---

## Current Sprint — Phase 14: Platform Integrity & Auth

### Task 1: Verify All Services Running [IN PROGRESS]

Every service must be online and healthy. Check all PM2 processes first, then Docker-owned supporting services.

| Service | Type | Port | Status | Notes |
|---------|------|------|--------|-------|
| recoder-app | PM2 | 3000 | Online | Main site, auth, billing |
| recoder-backend | PM2 (Gunicorn) | 8000 | Online | Python FastAPI. Has `conversation_analytics_queue` table missing (warning, non-critical). WeasyPrint missing libpango (warning). |
| docker-backend | Docker container | 3100 | Online (healthy) | Express + containers. Memory ~90% (monitor). |
| recoder-agents | PM2 | 3001 | Online | Repo/runtime owner is `recoder-agents/`. Legacy `recoder-frontend` naming may still appear in compatibility aliases and service labels. |
| recoder-web | PM2 or Docker (verify on host) | 5173 | Online | Remix IDE. Do not assume Docker is authoritative without checking the live Hetzner host. |
| recoder-studio | PM2 | 3005 | Online | AI workflow builder |
| recoder-agency | PM2 | 3007 | Online | Giselle-based agency |
| recoder-pm | PM2 | 3004 | Online | Product management |
| openclaw-gateway | Docker container | 18789 | Online (healthy) | A2A gateway |
| recoder-redis | Docker container | 6379 | Online (healthy) | Redis cache |
| recoder-prometheus | Docker container | 9090 | Online (healthy) | Metrics |
| recoder-alertmanager | Docker container | 9093 | Online (healthy) | Alerts |
| recoder-node-exporter | Docker container | 9100 | Online (healthy) | Node metrics |
| recoder-redis-exporter | Docker container | 9121 | Online (healthy) | Redis metrics |

**Action items:**
- [ ] Verify all PM2 processes healthy after server reboot
- [ ] Monitor docker-backend memory (currently ~90%)
- [ ] Create `conversation_analytics_queue` table or disable the analytics worker

### Task 2: Fix All Logos Across All Platforms [IN PROGRESS]

The correct Recoder logo is the **geometric 3D cube** (dark gray/black with white negative space). Located at:
- `app/public/logo.png` (1024x1024)
- `app/public/recoder-logo.png` (1408x768, wide)
- `recoder-agents/public/logo.png` (same geometric icon)

**WRONG logos** (orange-purple gradient "R" or old Kortix "K"):
- `recoder-symbol.svg` — gradient "R" square
- `Logomark.svg` — gradient "R" + "recoder" text
- `wordmark.svg` — gradient "R" + large "recoder" text
- `Logomark-Black.png` — old Kortix "K" logomark
- `logo_black.png` — old Kortix "K" symbol
- `recoder-brandmark-bg.svg` — gradient "R" background
- `recoder-brandmark-effect.svg` — gradient "R" effect
- `favicon-*.png`, `icon.png` — need to be checked per-platform

**Platforms to audit:**
- [ ] **recoder-agents** — Fixed `recoder-logo.tsx`, all `/recoder-symbol.svg` and `/Logomark.svg` refs replaced with `/logo.png`. Deployed. Need to verify favicon/icon.png files.
- [ ] **recoder-app (app/)** — Check all logo references, favicon files, SiteHeader/SiteFooter logo
- [ ] **recoder-studio** — Check logo component, favicon, branding
- [ ] **recoder-agency** — Check logo component, favicon, branding
- [ ] **recoder-pm** — Check logo component, favicon, branding
- [x] **recoder-web** — Check logo in Remix app
- [ ] **docker-backend** — Check any logo references in API responses
- [ ] **Delete wrong SVGs** from public/ dirs after all references removed

### Task 3: Fix Auth Flows (OAuth, Email Sign-in/Sign-up) [TODO]

Last session fixed:

**Still needs verification:**
- [ ] **Email/password sign-up** — Full flow: register → verification email arrives → click link → signin
- [x] **Email/password sign-in** — Existing user can sign in with credentials
- [ ] **GitHub OAuth sign-in** — Full flow through GitHub consent → callback → session created → dashboard
- [ ] **Google OAuth sign-in** — Full flow through Google consent → callback → session created → dashboard
- [ ] **Forgot password** — Page exists? Email sends? Reset works?
- [x] **Session persistence** — `recoder.session_token` cookie set correctly, survives page refresh
- [ ] **Cross-subdomain SSO** — Sign in on recoder.xyz, access agents.recoder.xyz without re-auth
- [ ] **Sign out** — Clears session, redirects to home
- [ ] **Middleware protection** — `/dashboard` redirects to `/auth/signin` when no session

### Task 4: Remove All Kortix/Cortix/Suna Branding [TODO]

Audit every platform for remnants of old branding:

- [ ] **recoder-agents** — About page had Cortix team photo (removed). Check all other pages for Cortix/Suna/Giselle text.
- [ ] **recoder-studio** — Was Giselle. Check all UI text, page titles, meta tags, footer
- [ ] **recoder-agency** — Was Giselle agency. Check all UI text, page titles, meta tags
- [ ] **recoder-pm** — Check for any old branding
- [ ] **recoder-app** — Grep for "kortix", "cortix", "suna", "giselle", "CodeCraft"
- [ ] **recoder-web** — Grep for old branding strings
- [ ] **docker-backend** — Check any user-facing strings
- [ ] **backend** — Check any user-facing strings

### Task 5: Fix recoder-agents Nav & Footer


### Task 6: Server Memory & Performance [TODO]

- [ ] docker-backend at ~90% memory — investigate and optimize
- [ ] Server has 8GB total — all services combined may be too much
- [ ] Consider: increase swap, reduce PM2 process memory limits, or upgrade server
- [ ] Node build needed `--max-old-space-size=4096` — server may not handle multiple concurrent builds

### Task 7: Database Schema Gaps [TODO]

- [ ] `conversation_analytics_queue` table missing — recoder-backend warns every cycle
- [ ] Run Prisma migrations or create missing tables
- [ ] Audit all `prisma.user` vs `prisma.users` calls (schema only has `model users`)

### Task 8: Email Infrastructure [TODO]

- [ ] Verify RESEND_API_KEY is set and working in production
- [ ] Test verification email delivery (sign up → email arrives?)
- [ ] Test password reset email delivery
- [ ] Check email templates render correctly

### Task 9: Billing & Payments [TODO]

- [ ] Paddle integration — are webhook keys set?
- [ ] DodoPayments integration — is it configured?
- [ ] Checkout flow — can a user subscribe to Pro?
- [ ] Subscription management — can a user cancel/reactivate?
- [ ] BYOK setup flow — user adds API key at `/settings/ai-providers`

### Task 10: Production Monitoring & Alerts [TODO]

- [ ] Prometheus + Alertmanager running but are alerts configured for real notifications?
- [ ] Health check script — verify it catches failures and alerts
- [ ] PM2 restart policy — verify all processes auto-restart on crash
- [ ] Log rotation — verify pm2-logrotate is working
- [ ] SSL certificate renewal — Cloudflare handles this but verify
- [ ] Backup verification — test database restore from backup

---

## Goal

**Deploy all Recoder apps to production and have a fully working live platform at recoder.xyz.**

Native releases (Desktop, Mobile) and GitHub-hosted CI are deferred indefinitely (no Apple/Google/GitHub billing).

## Infrastructure

- **Server**: Hetzner (77.42.23.19) — PM2-first for user-facing apps and primary backend services; Docker for supporting runtime infrastructure
- **DNS & Security**: Cloudflare — DNS management, DDoS protection, SSL/TLS, CDN caching
- **Domain**: `recoder.xyz` (all subdomains routed via Cloudflare -> Hetzner)
- **Auth**: Better Auth (centralized on recoder.xyz, cross-subdomain SSO via GitHub + Google OAuth)
- **AI**: BYOK-only — users provide their own API keys at /settings/ai-providers
- **Registry**: npm for CLI packages

## Subdomain Map

| Subdomain | App | Port | Status |
|-----------|-----|------|--------|
| `recoder.xyz` | app/ (main site, auth, billing, landing) | 3000 | 200 |
| `api.recoder.xyz` | backend/ (FastAPI, AI agents, LLM) | 8000 | 200 |
| `docker.recoder.xyz` | docker-backend/ (Express, containers, A2A) | 3100 | 200 |
| `web.recoder.xyz` | recoder-web (Remix IDE) | 5173 | 302 |
| `agents.recoder.xyz` | recoder-agents (AI agent IDE) | 3001 | 200 |
| `app.recoder.xyz` | recoder-agents (alias) | 3001 | 200 |
| `studio.recoder.xyz` | recoder-studio (AI workflow builder) | 3005 | 200 |
| `agency.recoder.xyz` | recoder-agency (Giselle-based agency) | 3007 | 200 |
| `pm.recoder.xyz` | recoder-pm (product management) | 3004 | 200 |

---

## Phase 1 — Core Platform

  - Public health endpoint verified as `https://backend.recoder.xyz/api/health` (`/health` and `/healthz` return 404 at the public origin)

## Phase 2 — User-Facing Apps

  - Renamed from "Recoder Frontend" to "Recoder Agents" across all UI
  - New subdomain: agents.recoder.xyz (+ app.recoder.xyz alias)

## Phase 3 — Extended Platform

  - Runtime contract verified on host: PM2 uses `next start` from `recoder-pm/apps/web`
  - Repo PM2 manifest aligned to host reality; previous standalone-server assumption was invalid for Hetzner because `apps/web/next.config.ts` only enables `output: "standalone"` when `DOCKER=1`

---

## Phase 14 — Ecosystem Integrity, Cross-App Auth & Branding [IN PROGRESS]

### Architecture Reference

**Auth model**: Centralized Better Auth on recoder.xyz. Shared `@recoder/auth` package. Session cookie on `.recoder.xyz` domain enables SSO.
**Data model**: Shared auth DB (user, session, account tables) + app-specific databases. No cross-app data sync.
**Two user tables by design**: `user` (Better Auth web auth) vs `users` (CLI auth/API keys) — MUST NOT be merged.

| App | Auth Method | SSO Status | Database | Notes |
|-----|------------|------------|----------|-------|
| recoder.xyz (main) | Better Auth (email/pass + OAuth) | Source of truth | Prisma/PostgreSQL | Owns auth, billing, API keys |
| recoder-agents | Delegates to recoder.xyz | Working | Stateless (calls docker-backend) | Auth client routes to recoder.xyz |
| recoder-studio | Token-based (not cookie) | BROKEN | Prisma/Neon | Doesn't use `credentials: include` |
| recoder-agency | Own Better Auth instance | Partial | Drizzle/Neon | Requires local profile sync; may fail |
| recoder-pm | Custom auth utils | BROKEN | Drizzle/Neon | No middleware; proprietary `currentUser()` |
| recoder-web | Separate (Remix) | N/A | Docker JSON persistence | Not part of auth ecosystem |
| docker-backend | API key / session token | N/A | JSON persistence | Internal service |
| backend (Python) | API key / session token | N/A | PostgreSQL | Internal service |

---

### Task 1: Verify All Services Running

| Service | Type | Port | Status |
|---------|------|------|--------|
| recoder-app | PM2 | 3000 | Online |
| recoder-backend | PM2 (Gunicorn) | 8000 | Online (analytics queue table missing — warn) |
| docker-backend | Docker | 3100 | Online (healthy, ~90% memory) |
| recoder-agents | PM2 | 3001 | Online |
| recoder-web | PM2 or Docker (verify on host) | 5173 | Online |
| recoder-studio | PM2 | 3005 | Online |
| recoder-agency | PM2 | 3007 | Online |
| recoder-pm | PM2 | 3004 | Online |
| openclaw-gateway | Docker | 18789 | Online |
| redis/prometheus/alertmanager/exporters | Docker | various | Online |

### Task 2: Fix All Logos Across All Platforms [IN PROGRESS]

**Correct logo**: Geometric 3D cube (dark gray/black, white negative space). Files: `app/public/logo.png` (1024x1024), `app/public/recoder-logo.png` (1408x768 wide), `recoder-agents/public/logo.png`.

**WRONG** (do NOT use): `recoder-symbol.svg`, `Logomark.svg`, `wordmark.svg` (gradient "R"), `Logomark-Black.png`, `logo_black.png` (Kortix "K"), `recoder-brandmark-*.svg`.

- [ ] **recoder-app** — Audit SiteHeader/SiteFooter logo, favicon files
- [ ] **recoder-studio** — Audit logo, favicon
- [ ] **recoder-agency** — Audit logo, favicon
- [ ] **recoder-pm** — Audit logo, favicon
- [x] **recoder-web** — Audit logo
- [ ] **Delete wrong SVGs/PNGs** from all public/ dirs

**Branding/runtime asset analysis (2026-03-03):**
- Main layouts across major apps are mostly already on Recoder assets/icons.
- `recoder-agents` still uses `/recoder-brandmark-bg.svg` in active runtime UI:
  - home hero background
  - dashboard background
- Logo cleanup is therefore not finished even if nav/footer/logo component swaps are already deployed.
- Many `Giselle` references in studio/agency appear to be internal engine/package naming, not necessarily user-facing branding regressions.
- Branding cleanup should prioritize active runtime UI, metadata, favicons, and visible copy before internal module/package names.

**User-facing branding/string analysis (2026-03-03):**
- The highest-signal remaining branding issues are still runtime-visible assets and URLs, not raw grep counts.
- `recoder-agents/src/app/suna/page.tsx` appears to be an intentional rebrand/SEO landing page, so it should not be treated as accidental brand residue unless product wants it removed.
- Most `Giselle` matches in `recoder-studio`, `recoder-agency`, and `recoder-web` are internal component, package, or engine names and should be treated as lower priority than visible UI/metadata cleanup.
- Hardcoded `apps/ui.giselles.ai` paths in active workflow code are not just naming leftovers; they are technical debt with runtime implications and should be tracked separately from simple text cleanup.

**Per-app favicon/metadata audit checklist (2026-03-03):**
- Strict checklist for each user-facing app:
  - root layout exports metadata or equivalent head links
  - `icon.png` and `favicon.ico` exist and are referenced consistently
  - apple touch icon is declared if the app targets install/mobile bookmarking
  - canonical URL or metadata base points to the correct production domain
  - OG/Twitter image URLs are valid for that app's domain
  - title/description reflect Recoder branding rather than legacy product naming
- Current root-layout status from repo:
  - `app` — strong metadata coverage with icons, manifest, canonical, OG, and Twitter
  - `recoder-agents` — strong metadata coverage, but root layout also injects manual `<title>` and meta tags that can drift from exported metadata
  - `recoder-web` — favicon/head links are present in Remix root, but meta ownership is route-driven and should be checked for consistency across routes
  - `recoder-studio` — icons and OG metadata present; no major root-layout branding mismatch found
  - `recoder-agency` — icons and OG metadata present; no major root-layout branding mismatch found
  - `recoder-pm` (`apps/app`, `apps/web`, `apps/portal`) — layouts visibly use `/icon.png`, but checked root layouts do not declare explicit metadata exports, so head correctness depends more on file conventions than an explicit contract
- Highest-risk metadata drift areas:
  - `recoder-agents` duplicated metadata sources
  - `recoder-pm` root layouts without explicit metadata exports
  - cross-app canonical / OG consistency rather than raw icon presence
- Analysis is now sufficient to move from branding/metadata discovery into implementation.
- Remaining uncertainty here is mostly runtime ownership and deployed asset behavior, not additional repo-reading.

**High-signal runtime branding gaps:**
- [ ] Replace active `recoder-brandmark-bg.svg` usage in `recoder-agents` runtime surfaces
- [ ] Audit favicon/icon assets per app, not just logo component refs
- [ ] Remove hardcoded `ui.giselles.ai` paths from active subagent workflow code after confirming replacement target

### Task 3: Fix Auth on recoder.xyz (Main App) [IN PROGRESS]

**Fixed:**

**End-to-end verification needed:**
- [ ] Email/password sign-up → verification email → click link → sign in
- [x] Email/password sign-in (existing user)
- [ ] GitHub OAuth → consent → callback → session → dashboard
- [ ] Google OAuth → consent → callback → session → dashboard
- [ ] Forgot password → email → reset → new password → sign in
- [x] Session persistence (`recoder.session_token` cookie on `.recoder.xyz`)
- [ ] Sign out clears session across all subdomains
- [ ] Middleware: `/dashboard` → `/auth/signin` when no session

**Analysis notes (2026-03-03):**
- `user` and `users` are both intentional and must remain separate:
  - `user` = Better Auth / web users
  - `users` = CLI / app users
- `emailVerified` is not a single invariant today; it is path-dependent.

**Current auth contract ranking from repo analysis:**
1. `/api/auth/cli` monolith is the only fully backed contract in the app server.
2. `/api/auth/cli/device|authorize|token` looks like the intended newer split contract, but the checked-in server surface is incomplete/inconsistent.
3. `/api/cli/device` looks legacy and browser-page-local, not primary.

**Verification-state mismatches:**
- `verify-email` link verification marks only `users.emailVerified = true`.
- `verify-code` marks both `user.emailVerified` and `users.emailVerified`.
- `verify-code` deletes only from `verifications`, while helper-based link verification consumes from both `verification` and `verifications`.
- Email-change request checks uniqueness in both `users` and `user`.
- Email-change confirm reads only `verifications` for both link and code paths.
- Email-change execution updates `users` first, then tries to update `user` by old email if a matching web-auth row exists.

**Net mismatch matrix:**
- A user verified by link can still look unverified in `user`.
- A user verified by code is more fully synchronized than a user verified by link.
- Email-change confirmation is the only flow that attempts to move both email tables together.
- Verification storage compatibility is asymmetric: helper-based link verification is dual-table, code verification and email-change flows are `verifications`-only.

**Implication:**
- "Test auth flows" is not enough by itself.
- The real requirement is to define the intended post-condition for each auth flow, then check every route against that contract.

**`recoder-code` contract audit (current state):**
- `packages/recoder-code` is the active client surface; `packages/cli` is not the target.
- `recoder-code` CLI and VS Code agree on:
  - web OAuth start via `/api/auth/cli`
  - code exchange via `POST /api/auth/cli` with `action: 'exchange_code'`
  - API key validation via `POST /api/auth/cli` with `action: 'validate_token'`
  - revoke via `POST /api/auth/cli` with `action: 'revoke_token'`
- `recoder-code` CLI and VS Code diverge on device flow:
  - CLI expects device-code creation at `/api/auth/cli/device`
  - VS Code expects device-code creation at `/api/auth/cli/authorize`
  - CLI expects polling at `POST /api/auth/cli/token`
  - VS Code expects polling at `GET /api/auth/cli/token`
  - CLI expects flat token fields (`access_token`, `refresh_token`, `expires_in`)
  - VS Code expects nested token object (`token.accessToken`, `token.refreshToken`, `token.expiresAt`)
- Against the app server:
  - `/api/auth/cli/device` exists
  - `/api/auth/cli/authorize` exists, but it is browser approval for authenticated users, not unauthenticated device-code issuance
  - no standalone `/api/auth/cli/token` route was found in the repo
  - refresh and device polling are only implemented as actions inside `/api/auth/cli`

**Conclusion:**
- The main app server is not clearly aligned with the `recoder-code` client you actually ship.
- The two `recoder-code` clients also disagree on the target protocol, so server alignment remains ambiguous until one contract is chosen as canonical.

**Canonical `recoder-code` auth contract (target for Phase 14):**
- Treat `packages/recoder-code/packages/cli` as the source of truth for CLI auth behavior.
- Keep web OAuth on `/api/auth/cli`:
  - GET = OAuth start / redirect
  - POST with `action: 'exchange_code'` = code exchange
  - POST with `action: 'validate_token'` = API key validation
  - POST with `action: 'revoke_token'` = revoke
- Use split device-flow routes for the newer client contract:
  - `POST /api/auth/cli/device` = create device code
  - `POST /api/auth/cli/token` = both device polling and refresh
- `POST /api/auth/cli/token` request modes:
  - device polling: `{ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code, client_id }`
  - refresh: `{ grant_type: 'refresh_token', refresh_token, client_id }`
- `POST /api/auth/cli/token` success response shape:
  - device authorized: `{ status: 'authorized', access_token, refresh_token, expires_in, user }`
  - refresh: `{ access_token, refresh_token?, expires_in, user? }`
- `RecoderAuthData` canonical client shape remains:
  - `{ access_token, refresh_token, expires_at, user }`
  - clients may derive `expires_at` from `expires_in`
- `/api/auth/cli/authorize` is browser approval only:
  - GET = load device-code info for signed-in user
  - POST = approve/deny device code
- `/api/cli/device*` is legacy and should not be treated as target behavior.
- `/api/auth/cli/verify` and `/api/auth/cli/validate` should converge to one validation contract; duplicate semantics are not a stable target.

**Phase 14 auth acceptance criteria derived from the canonical contract:**
- `recoder-code` CLI can complete web OAuth, device flow, refresh, API key validation, and revoke against the app server without fallback to legacy routes.
- VS Code companion follows the same device-flow route family and response envelope as the CLI package.
- Email verification and email-change flows produce explicitly defined post-conditions across `user` and `users`.

**Auth gap checklist (against canonical `recoder-code` contract):**

| Area | Target | Current state | Gap status |
|-----|--------|---------------|-----------|
| Web OAuth start | `GET /api/auth/cli` | Implemented | `implemented` |
| Code exchange | `POST /api/auth/cli` with `action: 'exchange_code'` | Implemented | `implemented` |
| API key validation | `POST /api/auth/cli` with `action: 'validate_token'` | Implemented | `implemented` |
| Revoke token | `POST /api/auth/cli` with `action: 'revoke_token'` | Referenced by clients; not confirmed in checked-in handler audit | `needs verification` |
| Device code creation | `POST /api/auth/cli/device` | Implemented | `implemented` |
| Browser device approval | `GET/POST /api/auth/cli/authorize` | Implemented | `implemented` |
| Device polling route | `POST /api/auth/cli/token` | No standalone route found | `missing` |
| Refresh route | `POST /api/auth/cli/token` | No standalone route found; only monolith `action: 'refresh_token'` exists | `missing` |
| Device polling fallback | `POST /api/auth/cli` with `action: 'device_token'` | Implemented in monolith | `wrong route family` |
| Refresh fallback | `POST /api/auth/cli` with `action: 'refresh_token'` | Implemented in monolith | `wrong route family` |
| Device success payload | `{ status: 'authorized', access_token, refresh_token, expires_in, user }` | Monolith returns `success`, `expires_at`, `platform_connection` shape | `wrong shape` |
| Refresh success payload | `{ access_token, refresh_token?, expires_in, user? }` | Monolith returns `access_token`, `expires_at`, optional `user` | `wrong shape` |
| VS Code device initiation | `/api/auth/cli/device` | VS Code currently uses `/api/auth/cli/authorize` | `client divergence` |
| VS Code device polling | `POST /api/auth/cli/token` JSON body | VS Code currently uses `GET /api/auth/cli/token` headers | `client divergence` |
| Validation endpoint | single validation contract | `/api/auth/cli/verify` and `/api/auth/cli/validate` both exist | `duplicate contract` |
| Email verification post-condition | explicit sync rules for `user` and `users` | Link/code/email-change flows disagree today | `wrong behavior` |
| Verification storage | one defined compatibility rule | link helpers are dual-table, code/email-change are `verifications`-only | `wrong behavior` |

**Execution order for auth closeout:**
1. Choose one `recoder-code` device-flow contract and align both CLI and VS Code to it.
2. Implement `/api/auth/cli/token` with canonical request/response shapes for device polling and refresh.
3. Remove reliance on monolith-only fallback actions for routes that now have canonical split endpoints.
4. Unify verification/email-change post-conditions across `user` and `users`.
5. Run end-to-end auth verification only after the contract is structurally consistent.

**Required post-conditions for verification flows (must be made explicit in code/tests):**

| Flow | Required post-condition | Current repo behavior | Gap status |
|-----|--------------------------|-----------------------|-----------|
| Sign-up link verification | `users.emailVerified = true`; if matching `user` exists, it must also be verified; verification record(s) consumed consistently | `verify-email` only updates `users`, then consumes both verification tables | `wrong behavior` |
| 6-digit code verification | Same verified-state invariant as link verification; verification record(s) consumed consistently | `verify-code` updates both `user` and `users`, but deletes only from `verifications` | `wrong behavior` |
| Email change request | New email must be unique across `users` and `user`; both code + token verification artifacts should follow one storage rule | Request checks both tables, but stores only in `verifications` | `partial / inconsistent` |
| Email change confirm (link) | `users.email = newEmail`, `users.emailVerified = true`; if matching `user` exists at old email, move it to new email and verify it; consume verification artifacts consistently | Reads only `verifications`; updates `users`, then tries `user` by old email | `partial / inconsistent` |
| Email change confirm (code) | Same post-condition as email-change link path | Reads only `verifications`; updates `users`, then tries `user` by old email | `partial / inconsistent` |
| Verification storage compatibility | One clearly defined compatibility rule for create/read/consume across `verification` and `verifications` | Helper is dual-table; code/email-change flows are mostly `verifications`-only | `wrong behavior` |

**Auth invariants to enforce in Phase 14:**
- `emailVerified` must not depend on whether the user verified by link or code.
- Email-change confirmation must leave `user` and `users` in a deterministic state when both rows exist.
- Verification-record lifecycle must follow one compatibility strategy for create, read, and consume.


**recoder-pm (BROKEN):**
- Custom `currentUser()` / `currentOrganizationId()` bypasses shared auth
- No `middleware.ts` — auth checks only in page components (late, leaky)
- Fix: Add proper middleware using `hasSessionCookie()` from `@recoder/auth/edge`, replace custom auth utils

**recoder-agency (PARTIAL):**
- Has own Better Auth instance + local `users` table sync
- Session cookie shared but profile must exist locally → can fail on first login
- Fix: Ensure profile auto-creation is robust, add error recovery

**Logout sync (ALL APPS):**
- No mechanism to clear session across all subdomains on sign-out
- Better Auth only clears cookie for the current origin
- Fix: Sign-out endpoint should clear cookie with `domain=.recoder.xyz`, OR add cross-subdomain logout broadcast

**Test matrix after fixes:**
- [ ] Sign in on recoder.xyz → navigate to agents.recoder.xyz → already authenticated
- [ ] Sign in on recoder.xyz → navigate to studio.recoder.xyz → already authenticated
- [ ] Sign in on recoder.xyz → navigate to agency.recoder.xyz → already authenticated
- [ ] Sign in on recoder.xyz → navigate to pm.recoder.xyz → already authenticated
- [ ] Sign out on any app → all apps lose session

**SSO gap table (repo analysis, 2026-03-03):**

| Surface | Intended auth mode | Current repo behavior | Gap status |
|-----|---------------------|-----------------------|-----------|
| `recoder.xyz` (`app`) | Source of truth for Better Auth session cookie on `.recoder.xyz` | Canonical session lives here; `/api/auth/session` is the main verification surface | `source of truth` |
| `recoder-agents` | Shared cookie + delegated auth to main site | Middleware uses shared-cookie checks and many browser requests use `credentials: 'include'`, but app code also depends heavily on `/api/auth/session-token` helper that was not found as a checked-in route | `partial / hidden dependency` |
| `recoder-web` | Delegate session verification to main site | Uses `MAIN_SITE_URL` and forwards cookie-backed session checks to main-site auth/session | `implemented delegation` |
| `recoder-studio` | Shared cookie / delegated session | Reads shared cookie in loaders, but broader auth model is still treated as token/local-profile oriented in the plan and needs explicit cookie-first verification path | `partial / inconsistent` |
| `recoder-agency` | Shared cookie with local profile sync | Reads shared cookie in loaders, but still depends on local profile existence and sync behavior | `partial / local-sync risk` |
| `recoder-pm` | Shared cookie / delegated session | Large surface still depends on local `currentUser()` usage and no middleware-first shared-auth posture | `broken / local auth assumptions` |

**Cross-app SSO implications:**
- `recoder-agents` is closest to the desired model, but it still has a hidden dependency on a `session-token` bridge that is not clearly present in the repo.
- `recoder-web` already treats recoder.xyz as auth authority and is the cleanest delegation model after the main app.
- `recoder-studio` and `recoder-agency` can read the shared cookie, but local data/profile assumptions still make first-login and session propagation less deterministic.
- `recoder-pm` is the farthest from the shared-auth model because auth is still embedded in app-local helpers and actions instead of middleware-first shared session enforcement.

**Task 4 closeout criteria:**
- Every protected app accepts the shared `.recoder.xyz` session cookie as the first auth signal.
- No app requires a separate local login when a valid main-site session exists.
- Local profile creation/sync is treated as a provisioning concern, not as a second auth system.
- Sign-out clears or invalidates auth consistently across all subdomains.

### Task 5: Consolidate Auth UI [TODO]

recoder-agents has polished auth (animated bg, magic link, referral codes, GDPR, email provider detection). Main app has functional but basic dark-themed auth. Consider using agents' auth as unified entry point.

| Aspect | recoder-agents | recoder.xyz main |
|--------|---------------|------------------|
| Design | Polished — animated bg, side-by-side | Dark minimal — centered card |
| Methods | Magic link + Google | Email/pass + GitHub + Google |
| 2FA | No | Yes |
| Referral codes | Yes | No |
| GDPR consent | Yes | No |

**Option A**: Redirect recoder.xyz `/auth/*` to agents.recoder.xyz `/auth` via nginx
**Option B**: Extract agents' auth UI into shared component, use in both apps
**Option C**: Enhance main app auth to match agents' polish level

**If Option A or B:**
- [ ] Add GitHub OAuth to agents auth (currently Google-only)
- [ ] Add 2FA support to agents auth
- [ ] Add email/password as alternative (already at `/auth/password`)
- [ ] Keep device auth + verify-email API in main app (CLI-coupled)

### Task 6: Fix Cross-App Navigation [TODO]

**Problem**: Users can't easily switch between ecosystem apps.

**Current state:**
- recoder.xyz has `AppSwitcher` component (grid icon in navbar) — links to all sub-apps. Works.
- recoder-agents has NO ecosystem navigation in sidebar. Users are trapped.
- recoder-studio has ecosystem links in sidebar (Home, Web, Agency, PM). Missing: Agents.
- recoder-agency has NO ecosystem navigation.
- recoder-pm has NO ecosystem navigation.

**Shared config gaps:**
- `@recoder/ecosystem-config` has `RECODER_ECOSYSTEM_URLS` but is MISSING `agents.recoder.xyz`
- `RECODER_ECOSYSTEM_APPS` array only has 6 apps — missing Agency

**Ecosystem config analysis (2026-03-03):**
- There are multiple competing platform registries in the repo.
- `packages/ecosystem-config` is incomplete for current production reality:
  - missing `agents.recoder.xyz`
  - app list does not reflect the fuller live ecosystem
- `app/lib/config/platforms.ts` has a more complete runtime list including agents, agency, and openclaw.
- This creates navigation/app-switcher drift and makes cross-app UX inconsistent even when links exist in some apps.

**Implication:**
- Cross-app navigation should be treated as a source-of-truth problem, not just a missing-links problem.
- One canonical platform registry should drive app switchers, marketing/platform links, and any ecosystem-aware UI.

**Operational/deployment drift analysis (2026-03-03):**
- Production ownership is split across multiple deployment stories:
  - PM2 host processes in `ecosystem.config.js`
  - legacy standalone docker-backend PM2 in `docker-backend/ecosystem.config.js`
  - `docker-compose.deploy.yml`
  - `docker-compose.production.yml`
- Repo scripts do not consistently target the same manifest:
  - `scripts/deploy-all-services.sh` and `scripts/post-rotation-verify.sh` target the Docker-owned supporting stack via `docker-compose.deploy.yml`
  - `scripts/deploy-production.sh` targets `docker-compose.production.yml`
- Current conclusion:
  - Hetzner is PM2-first for user-facing apps and primary backend services.
  - Docker is a supporting runtime layer, not the primary app deployment story.
  - Reboot resilience verification must treat PM2 as the first-class app runtime and Docker as infra/supporting services.
- Conclusion:
  - reboot resilience cannot be reasoned about cleanly until the live server's actual deployment path is identified
  - the repo currently contains multiple competing "production" stories
  - service dependency order exists inside compose files via `depends_on`, but there is no repo-wide single source of truth for the live stack

### Phase 14 Auth Decision Log (2026-03-03)

**Settled architecture:**
- `recoder.xyz` main app is the auth source of truth.
- Shared session cookie is `recoder.session_token` / `__Secure-recoder.session_token` on `.recoder.xyz`.
- `user` and `users` are both intentional:
  - `user` = Better Auth / web-auth identity
  - `users` = CLI / app identity
- `packages/recoder-code` is the client surface that matters for CLI auth decisions.

**Settled target contracts:**
- Web OAuth remains on `/api/auth/cli`.
- Canonical device-flow target is:
  - `POST /api/auth/cli/device`
  - `POST /api/auth/cli/token`
  - `GET/POST /api/auth/cli/authorize` for browser-side approval only
- `/api/cli/device*` is legacy and not a target contract.
- Cross-subdomain auth should be shared-cookie-first, not per-app local login.

**Settled auth invariants:**
- `emailVerified` must not depend on whether verification happened by link or code.
- Email-change confirmation must leave `user` and `users` in a deterministic state when both rows exist.
- Verification storage must follow one compatibility rule for create/read/consume.

**Open implementation gaps:**
- No checked-in standalone `/api/auth/cli/token` route.
- `recoder-code` CLI and VS Code still disagree on device-flow details.
- `recoder-agents` depends on a `session-token` bridge that is not clearly present in the repo.
- `recoder-pm` still relies on local `currentUser()`-style auth assumptions.

**Open decisions still requiring explicit choice:**
- Whether VS Code should be aligned to the CLI package contract or vice versa.
- Whether `/api/auth/cli/verify` or `/api/auth/cli/validate` becomes the single surviving validation endpoint.
- Whether `recoder-agents` should keep a separate session-token bridge or move fully to shared-cookie + delegated verification.

**High-risk assumptions to verify explicitly:**
- `/api/auth/session-token` may exist only in deployment/runtime glue or may be missing entirely; repo snapshot does not show a checked-in route.
- Successful shared-cookie SSO is not sufficient for full feature access in `recoder-agents` if bearer-style session-token bridging is still required internally.
- A green route inventory does not prove auth correctness because verification/email-change flows currently have different post-conditions.
- `recoder-code` end-to-end auth can still fail even if OAuth start and code exchange work, because refresh and device polling depend on the unresolved `/api/auth/cli/token` contract.
- Apps that can read the shared cookie (`recoder-studio`, `recoder-agency`) may still fail user entry if local profile/bootstrap logic is treated as part of authentication.
- `recoder-pm` may appear authenticated in some server actions while still lacking a real middleware-first shared-session contract.

**What Phase 14 verification must prove in production, not just in code review:**
- Shared-cookie login is enough to enter each intended app without a second sign-in prompt.
- `recoder-code` CLI and VS Code can both complete their supported auth flows against the same server contract.
- Authenticated feature paths in `recoder-agents` work without a hidden missing dependency on `/api/auth/session-token`.
- Link verification, code verification, and email-change verification leave accounts in the same intended verified state.

**Observed browser/runtime failures on `agents.recoder.xyz` (2026-03-03):**
- Google sign-in requests to `https://recoder.xyz/api/auth/sign-in/social` are being blocked by `connect-src` CSP from the agents origin.
- `recoder-agents` auth client intentionally targets `https://recoder.xyz` for auth on production subdomains, so CSP must explicitly allow this path.
- Stripe checkout script loading fails because `https://js.stripe.com` is not allowed by the current `script-src` CSP.
- Cloudflare beacon is also blocked by current CSP.
- Vercel analytics and speed-insights scripts are attempted but 404 on the deployed origin, producing MIME/type errors and noisy console failures.
- Some remaining console noise is extension/browser-specific and not a product bug:
  - `window.ethereum` override warning
  - `chrome-extension://... Unexpected token 'export'`
  - some QUIC/resource transport noise

**Implication:**
- `recoder-agents` auth verification is currently blocked at the browser policy layer, not only at the API/config layer.
- Billing/checkout verification on `recoder-agents` is also blocked at the CSP layer.
- Production auth closeout must include CSP/header review for every surface that delegates auth or loads third-party billing/analytics scripts.

**Do not regress:**
- Do not collapse `user` and `users` into one table; the split is intentional.
- Do not add new auth routes that duplicate existing semantics without first choosing the canonical contract.
- Do not keep both monolith-only and split-route auth behaviors alive indefinitely; compatibility bridges must be temporary and explicit.
- Do not let link verification and code verification produce different `emailVerified` outcomes.
- Do not treat local profile bootstrap as a separate auth system in studio, agency, or pm.
- Do not make `recoder-agents` depend on an undeclared runtime-only auth bridge without documenting or checking it into the repo.
- Do not ship `recoder-code` CLI and VS Code auth behavior that disagree on route family or response envelope.

**Current blockers / unknowns:**
- Unknown whether `/api/auth/session-token` is provided outside the repo at deploy time or simply missing.
- Unknown which `recoder-code` client behavior should be treated as canonical for device flow: CLI package or VS Code companion.
- Unknown whether production currently relies on monolithic `/api/auth/cli` fallback behavior for refresh/device polling despite newer split-route expectations.
- Unknown whether first-login failures in studio/agency are auth failures or profile/bootstrap failures.
- Unknown whether `recoder-pm` has any hidden middleware/auth integration outside the obvious `currentUser()` usage surface.

**Classification of remaining auth work:**
- `code/design`:
  - choose canonical `recoder-code` device-flow contract
  - implement `/api/auth/cli/token`
  - unify validation endpoint semantics
  - unify verification/email-change post-conditions
- `runtime/production verification`:
  - prove whether `/api/auth/session-token` exists in deployed runtime
  - prove cross-subdomain sign-in/sign-out across all apps
  - prove `recoder-code` CLI and VS Code both work against the same production contract
  - prove verification flows leave identical verified-state outcomes

**Production auth verification matrix (Phase 14 closeout):**

| Scenario | Expected result | Proves |
|-----|------------------|--------|
| Sign up with email/password on recoder.xyz | account created; verification email arrives; no unexpected auth errors | base registration path works |
| Verify by emailed link | resulting account is verified in intended state across `user`/`users` | link verification post-condition is correct |
| Verify by 6-digit code | resulting account reaches same verified state as link path | code verification matches link verification |
| Change email, confirm by link | email changes successfully; verified state remains correct; old identity is not left half-synced | email-change link path is deterministic |
| Change email, confirm by code | same final state as email-change link path | email-change code path matches link path |
| Sign in with existing email/password | session cookie set on `.recoder.xyz`; protected pages open | core session issuance works |
| Sign in with GitHub OAuth | callback succeeds; session established; protected app opens | GitHub OAuth end-to-end works |
| Sign in with Google OAuth | callback succeeds; session established; protected app opens | Google OAuth end-to-end works |
| Refresh recoder.xyz after login | still authenticated | session persistence works |
| Open agents.recoder.xyz after main-site login | no second sign-in; user lands in authenticated app state | shared-cookie SSO for agents works |
| Use authenticated feature in recoder-agents that needs bearer token | feature works without hidden auth failure | `session-token` dependency is satisfied in reality |
| Open web.recoder.xyz after main-site login | authenticated session is recognized via delegated verification | main-site delegation model works |
| Open studio.recoder.xyz after main-site login | authenticated access works without separate login | studio accepts shared session correctly |
| Open agency.recoder.xyz after main-site login | authenticated access works; local profile bootstrap does not block entry | agency sync/bootstrap is not acting as auth gate |
| Open pm.recoder.xyz after main-site login | authenticated access works through protected surfaces | PM no longer depends on purely local auth assumptions |
| Sign out from one app | session is invalid across all intended subdomains | logout propagation works |
| `recoder-code` CLI web OAuth login | login, code exchange, persisted session, and subsequent authenticated command all succeed | canonical CLI web auth contract works |
| `recoder-code` CLI device flow login | device code issuance, browser approval, token polling, persisted session all succeed | canonical CLI device flow works |
| `recoder-code` CLI token refresh | near-expiry session refresh succeeds without route/shape mismatch | `/api/auth/cli/token` refresh contract works |
| VS Code extension login | same auth server contract works for extension | CLI and VS Code are aligned to one protocol |

**Evidence references (key files behind the auth analysis):**
- Main app auth source of truth:
  - `app/lib/auth-config.ts`
  - `app/app/api/auth/session/route.ts`
- Shared verification compatibility logic:
  - `app/lib/auth/verification-store.ts`
- Verification flow behavior:
  - `app/app/api/auth/verify-email/route.ts`
  - `app/app/api/auth/verify-code/route.ts`
  - `app/app/api/user/account/route.ts`
  - `app/app/api/user/account/verify-email-change/route.ts`
- Monolithic CLI auth contract:
  - `app/app/api/auth/cli/route.ts`
- Split CLI auth routes:
  - `app/app/api/auth/cli/device/route.ts`
  - `app/app/api/auth/cli/authorize/route.ts`
  - `app/app/api/auth/cli/verify/route.ts`
  - `app/app/api/auth/cli/validate/route.ts`
  - `app/app/api/auth/cli/sessions/route.ts`
  - `app/app/api/auth/cli/keys/route.ts`
- Legacy CLI device flow:
  - `app/app/api/cli/device/route.ts`
  - `app/app/api/cli/device/poll/route.ts`
  - `app/app/[locale]/cli/authorize/page.tsx`
- Current browser approval UI for split flow:
  - `app/app/[locale]/cli/auth/page.tsx`
- Active `recoder-code` client contracts:
  - `packages/recoder-code/packages/cli/src/services/RecoderAuthService.ts`
  - `packages/recoder-code/packages/vscode-ide-companion/src/services/RecoderAuthService.ts`
- Cross-app SSO surfaces:
  - `recoder-agents/src/middleware.ts`
  - `recoder-agents/src/lib/auth/session-token.ts`
  - `recoder-web/app/lib/auth/session.server.ts`
  - `recoder-studio/app/workspaces/[workspaceId]/data-loader.ts`
  - `recoder-agency/apps/agency/app/workspaces/[workspaceId]/data-loader.ts`
  - `recoder-pm/apps/app/lib/auth.ts`
- `app/lib/config/platforms.ts` has a separate, more complete list of 10 services — two sources of truth

**Fix plan:**
- [ ] Update `@recoder/ecosystem-config` to include ALL apps (agents, agency, openclaw)
- [ ] Add AppSwitcher or ecosystem nav to recoder-agents sidebar
- [ ] Add AppSwitcher or ecosystem nav to recoder-agency
- [ ] Add AppSwitcher or ecosystem nav to recoder-pm
- [ ] Add agents.recoder.xyz to recoder-studio sidebar links
- [ ] Consider: single shared `AppSwitcher` component in `@recoder/shared`
- [ ] Consolidate `platforms.ts` and `ecosystem-config` into one source of truth

### Task 7: Remove Kortix/Cortix/Suna/Giselle Branding [TODO]

- [ ] **recoder-agents** — About page Cortix photo removed. Grep remaining old names.
- [ ] **recoder-studio** — Was Giselle. Full UI text, titles, meta audit.
- [ ] **recoder-agency** — Was Giselle agency. Full audit.
- [ ] **recoder-pm** — Check for old branding.
- [ ] **recoder-app** — Grep for "kortix", "cortix", "suna", "giselle", "CodeCraft".
- [ ] **recoder-web** — Grep for old branding.
- [ ] **docker-backend** — `subagent-workflow.ts` has hardcoded path `apps/ui.giselles.ai` — remove.

**String-cleanup analysis (2026-03-03):**
- Treat active user-facing remnants separately from internal historical naming.
- Priority user-facing cleanup:
  - visible old logos/backgrounds
  - visible product names in page copy, metadata, emails, and navigation
  - hardcoded legacy domains/paths that can leak into runtime behavior
- Lower-priority references:
  - internal `Giselle` engine/module names
  - generated docs/licenses
  - package/template scaffolding not exposed to users
- `suna` should be reviewed as a product/SEO decision, not blindly removed by grep.
- `ui.giselles.ai` references in active subagent workflow code should be treated as runtime migration debt, not just branding copy.

### Task 8: Fix recoder-agents Nav & Footer


### Task 9: Fix Hardcoded Localhost URLs [IN PROGRESS — HIGH]

| File | Issue | Fix |
|------|-------|-----|
| `docker-backend/src/server.ts:1368` | localhost in CORS whitelist | Exclude in production |
| `app/lib/email.ts` | localhost in email templates | Use `NEXT_PUBLIC_APP_URL` |
| `recoder-agents/src/app/auth/actions.ts` | localhost fallback | Use env var |
| `recoder-agents/src/app/auth/callback/route.ts` | localhost fallback | Use env var |
| `recoder-agents/src/app/api/integrations/*/callback` | localhost:8000 | Use env var |
| `recoder-agents/src/components/thread/SSHTerminal.tsx` | localhost:8000 | Use env var |

**Progress (2026-03-06):**
- [x] `docker-backend/src/server.ts` auth middleware localhost-origin bypass now only applies outside production.
- [x] `recoder-agents/src/app/auth/actions.ts` password sign-in redirect URL base now uses `resolveAgentsSiteUrl()` (env/runtime-resolved) instead of hardcoded localhost.
- [x] `app/lib/email.ts` verified no localhost template URLs in active code paths.
- [x] `recoder-agents/src/app/auth/callback/route.ts` verified no localhost fallback in active code path.
- [x] `recoder-agents/src/app/api/integrations/*/callback` verified no localhost:8000 callback URLs.
- [x] `recoder-agents/src/components/thread/recoder-computer/components/SSHTerminal.tsx` verified backend URL is resolved via `resolveBackendApiUrl()`.

### Task 10: Server Memory & Performance [TODO]

- [ ] docker-backend at ~90% memory — investigate
- [ ] Node build needs `--max-old-space-size=4096` — limited RAM
- [ ] Consider: increase swap, upgrade server, or reduce process count

### Task 11: Database Schema & Data [TODO]

- [ ] `conversation_analytics_queue` table missing — create or disable worker
- [ ] Audit `prisma.user` vs `prisma.users` calls across all routes
- [ ] Run pending Prisma migrations

**Schema/integrity analysis (2026-03-03):**
- `conversation_analytics_queue` appears to be a real schema gap, not just a noisy warning.
- Exact in-repo ownership is unresolved:
  - backend admin API reads the table directly
  - repo-wide search did not find any Prisma model, Supabase migration, SQL migration, or bootstrap script that creates it
  - current evidence points to a missing migration/deploy step rather than a table that is clearly created elsewhere in this repo
- Until a creation source is identified, this should be treated as an integrity/deployment unknown, not a cosmetic warning.
- [ ] Verify shared auth DB has correct tables (user, session, account, verification)

**Schema/integrity analysis (2026-03-03):**
- `conversation_analytics_queue` appears to be a real schema gap, not just a noisy warning.
- Repo analysis found backend admin analytics reads against this table, but no table creation/migration for it.
- This should be treated as a deploy/schema integrity issue separate from auth.
- Leaving it in warning-only state means service health can look green while backend analytics remains structurally incomplete.

**Implication:**
- Either create the table with the expected schema or disable the worker/admin path that assumes it exists.
- Do not treat this as cosmetic logging noise until the missing-table assumption is resolved.

### Task 12: Email Infrastructure [TODO]

- [ ] Verify RESEND_API_KEY works in production
- [ ] Test verification email delivery end-to-end
- [ ] Test password reset email delivery
- [ ] Fix email templates — no localhost URLs, correct branding

### Task 13: Billing & Payments [TODO]

- [ ] Paddle webhook keys set?
- [ ] DodoPayments configured?
- [ ] Checkout flow works?
- [ ] Subscription cancel/reactivate works?
- [ ] BYOK flow: user adds API key at `/settings/ai-providers`
- [ ] Cross-app billing awareness: do agents/studio/agency check subscription status?

**Billing/runtime analysis (2026-03-03):**
- `recoder-agents` checkout page loads Stripe via `https://js.stripe.com/v3/`.
- Current `recoder-agents` CSP does not allow Stripe script loading, so checkout can fail before any backend billing logic runs.
- Billing verification on `recoder-agents` must therefore include frontend CSP correctness, not just provider keys/webhooks.

### Task 14: Production Monitoring [TODO]

- [ ] Prometheus alerts → real notifications (email/Slack)?
- [ ] Health check script catches failures
- [ ] PM2 auto-restart on crash
- [ ] pm2-logrotate working
- [ ] Database backup restore tested
- [ ] SSL renewal (Cloudflare manages — verify)

### Task 15: Missing Error Pages & UX [TODO]

- [ ] recoder-agents — add root `loading.tsx` and `error.tsx`
- [ ] All platforms — verify 404 pages exist and branded
- [ ] All platforms — error boundaries catch crashes

### Task 16: SEO & Discoverability [TODO]

- [ ] Open Graph images render correctly
- [ ] Structured data valid (BreadcrumbSchema, FAQPageSchema)
- [ ] Submit sitemaps to Google Search Console
- [ ] Canonical URLs correct across all platforms

### Task 17: Unified User Experience [TODO — FUTURE]

Long-term: make the ecosystem feel like one product, not 6 separate apps.

- [ ] **Shared notification system** — notify across apps (agent completed task, PM update, etc.)
- [ ] **Unified settings** — profile/avatar change on recoder.xyz reflects everywhere instantly
- [ ] **Cross-app project linking** — agent workspace linked to PM project linked to web IDE
- [ ] **Single dashboard** — recoder.xyz dashboard shows activity across ALL apps
- [ ] **Billing awareness** — all apps check subscription via recoder.xyz API, show upgrade prompts
- [ ] **Consistent theme** — all apps share the same design tokens (colors, fonts, spacing)

---

## Deferred — Native Releases (No Timeline)

### Blocked: Apple Developer Certificate
- Desktop + macOS notarization: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

### Blocked: Play Store Signing
- Android keystore: `openclaw/apps/android/keystore.properties`

### Blocked: App Store Connect API Key
- iOS Fastlane: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`

### Blocked: Expo Token
- GitHub Actions secret `EXPO_TOKEN` for mobile CI

### Blocked: GitHub Actions Billing
- Hosted runner spend limits for iOS/Desktop workflows

---

## Completed — "Slack for Agents" Productization (2026-02-28)

All 7 productization gaps are fully implemented with acceptance criteria met.

### Gap 1: Frontend UI for Agent Collaboration
- Channel view with message rendering, thread expand/collapse, task status badges, artifact rendering (image/code/file)
- Channel sidebar with navigation, online agent indicators, unread badges, create/delete channels
- Message windowing (200 msg limit + "load earlier"), smart auto-scroll
- Task dispatch input with agent selector, orchestration pattern picker
- Multi-dispatch dialog with agent selection and progress tracking
- Mention autocomplete for @agent references
- Agent status cards with platform badges, skill tags, current task display

### Gap 2: Persistent Storage
- Tasks, approvals, events, workspaces, and dispatches persist to JSON via `loadStore/saveStore`
- Debounced writes for high-frequency mutations (task transitions, events)
- Approval timeout re-arming on server restart
- Event replay from persisted recent events (capped at 1000)

### Gap 3: Concurrent Multi-Agent Execution
- Multi-dispatch service dispatches to N agents simultaneously
- Worktree isolation creates per-agent git branches when `worktreeIsolation: true`
- Worktree conflict detection via dry-run merge (`detectConflicts()`)
- Conflict events published via event bus and surfaced as warnings in channel UI
- Container resolution via Docker label filtering for project -> containerId mapping

### Gap 4: Git Worktree Isolation
- WorktreeManagerService: create, list, diff, merge, detect conflicts, cleanup
- Worktree path convention: `.worktrees/agent/<agentId>/<taskId>`
- Merge controls with strategy selector (merge/rebase)
- Merge conflict resolver UI with accept ours/theirs options
- Worktree panel with branch tree visualization

### Gap 5: Smart Routing (Auto-Assignment by Skill Match)
- CapabilityMatcher scores agents by required/preferred capabilities, tier, platform match
- Human-readable `reason` field on every AgentMatch
- Auto-routing in multi-dispatch falls back to workspace members when no capability match
- Routing reasons surfaced in dispatch channel messages and dispatch tracker UI

### Gap 6: Interactive Approval UX
- Approval cards with approve/reject/escalate buttons
- Risk labels (high=red, medium=amber, low=green) based on action type and file count
- Collapsible action preview panel showing diffs (colored +/- lines), affected files, commands
- Escalation extends timeout by 2x for human review
- React Query mutations for approve/reject/escalate with cache invalidation
- Backend escalate endpoint + event bus integration

### Gap 7: Mission Control Dashboard
- Agent fleet overview with real-time online/offline status grid
- Task pipeline kanban (Submitted -> Working -> Input Required -> Completed -> Failed)
- SLO dashboard: completion rate, P50/P95 latency, error rate, agent utilization, tasks/hour
- Cost tracking: tokens used, estimated cost ($), average tokens/task
- Queue depth and retry count metrics
- Activity timeline with SSE event streaming, filterable by type
- Workspace SSE stream endpoint for live updates

### Infrastructure Built
- `dockerBackendApi` client (recoder-frontend -> docker-backend port 3001)
- Agent bridge WebSocket (`/agent-bridge`) with rate limiting (60 msg/10s)
- CLI AgentBridgeService with auto-reconnect, heartbeat, workspace join/leave
- CLI `/workspace` commands (join, leave, status, list)
- `wireAutonomousRouting()` wired at server startup for @mention -> handoff routing
- 3 Zustand stores (workspace, channel, agent-team)
- 7 React Query hook files (workspaces, channels, channel-sse, tasks, multi-dispatch, approvals, handoffs)
- Shared A2A types (workspace, dispatch, worktree, approval, handoff)

### Completed — A2A / Interoperability
- Tier-1 complete: 5 connector adapters (Claude, Codex, Cursor, Windsurf, Replit)
- Full A2A envelope protocol with intents, payloads, state machine
- SSE streaming + event bus with workspace-scoped subscriptions
- Delegation + approval semantics preserved across adapters
- Context bridge for sharing state between agents
- Tier-2 remains backlog-only until promotion prerequisites met

### Completed — Beta Launch Plan (OAuth + BYOK + All Platforms)
- OAuth centralized through recoder.xyz (GitHub + Google)
- BYOK enforcement: api-key-resolver.ts forces user keys, BYOK guards on studio/agency
- All 9 services deployed to Hetzner PM2
- Cloudflare DNS, nginx reverse proxy, SSL all configured
- .env.production secrets secured (untracked from git)

### Completed — Operational Scripts
- iOS local verify preflight + CI-friendly skip behavior
- `scripts/check-ios-simulator-runtime.sh`
- `scripts/verify-openclaw-ios-local.sh` with `ALLOW_SKIP_MISSING_IOS_RUNTIME=1` support
