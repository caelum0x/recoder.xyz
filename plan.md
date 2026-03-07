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
| recoder-web | https://web.recoder.xyz | 302 (intentional auth gate), `/api/health` 200 |

Last updated: 2026-03-07

All 9 services are live on Hetzner (77.42.23.19). Platform is in beta — BYOK-only, no platform AI keys.

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
| `web.recoder.xyz` | recoder-web (Remix IDE) | 5173 | 302 (intentional auth gate), `/api/health` 200 |
| `agents.recoder.xyz` | recoder-agents (AI agent IDE) | 3001 | 200 |
| `app.recoder.xyz` | recoder-agents (alias) | 3001 | 200 |
| `studio.recoder.xyz` | recoder-studio (AI workflow builder) | 3005 | 200 (frozen/abandoned) |
| `agency.recoder.xyz` | recoder-agency (Giselle-based agency) | 3007 | 200 |
| `pm.recoder.xyz` | recoder-pm (product management) | 3004 | 200 |

## Auth Architecture

- `recoder.xyz` is the auth source of truth (Better Auth, email/pass + OAuth).
- Shared session cookie: `recoder.session_token` / `__Secure-recoder.session_token` on `.recoder.xyz`.
- Two user tables by design: `user` (Better Auth / web-auth) vs `users` (CLI / app identity) — MUST NOT be merged.
- `packages/recoder-code` is the client surface for CLI auth.

---

## Remaining Tasks

### 1. Auth Completion [VERIFIED 2026-03-06]

**What's done**: Email/password sign-up/in, GitHub/Google OAuth, session persistence, cross-subdomain SSO, middleware protection, forgot-password API, fallback logout route. Neon DB quota bypassed with local temp Postgres.

- [x] **Registration + email verification** — tested end-to-end on production (user created, Resend emails sent)
- [x] **Forgot password email delivery** — reset email sent via Resend (message ID confirmed in logs)
- [x] **Cross-subdomain SSO** — verified with live session cookie on `.recoder.xyz`:
  - `recoder.xyz` → `agents.recoder.xyz` — session recognized
  - `recoder.xyz` → `agency.recoder.xyz` — session recognized (dbId assigned)
  - `recoder.xyz` → `pm.recoder.xyz/app` — authenticated redirect (307)
- [x] **Cross-subdomain sign-out propagation** — verified across all surfaces
- [x] **`recoder-code` CLI device flow** — endpoint + verifier script ready (live run pending `ADMIN_SECRET`)

**Remaining**:
- [ ] Forgot password full mailbox-link click → reset flow end-user verification
- PM workspace runtime is marketing-first; `/app` serves auth-gated redirect shim

### 2. Server Memory & Disk [RESOLVED 2026-03-07]

Memory: 5.4GB/16GB — healthy. Docker-backend capped at 2G.

- **Disk: 24% used (111GB free of 150GB)** — healthy
  - Resolved from 99% → 24% via: unused dir cleanup, `.next/cache` purge, multi-stage Docker builds, dangling image prune (3.7GB), build cache prune
  - `du`/`df` discrepancy was stale superblock counter from last clean unmount; corrected after prune
  - Multi-stage Docker builds deployed: docker-backend (4.81GB → 3.1GB), recoder-web (rebuilt with fixed imports)
  - recoder-web Docker image rebuilt after fixing 5 stale `@giselles-ai/*` → `@recoder/*` imports
  - Added missing `INTERNAL_SERVICE_KEY` to recoder-web .env (required for production startup)

### 3. Email Delivery [VERIFIED 2026-03-06]

- [x] Verification email arrives via Resend (message ID: `4d6cfb86-...`)
- [x] Welcome email arrives via Resend (message ID: `c94dafab-...`)
- [x] Password reset email arrives via Resend (message ID: `febacdbc-...`)
- All sent to real Gmail (`subasiarhan3+test1772806029@gmail.com`) — check inbox for confirmation

### 4. Billing & Payments [NEEDS PROVIDER KEYS]

All billing env vars are still placeholders (`your-paddle-*`, `your-dodo-pay-*`). Health endpoint correctly reports `configured: false`.

- [ ] Configure real Paddle or DodoPayments API keys in production
- [ ] Test checkout flow end-to-end (user subscribes to Pro)
- [ ] Test subscription cancel/reactivate
- [ ] Verify BYOK flow at `/settings/ai-providers` (`scripts/verify-byok-e2e.sh` ready)
- [x] Verify cross-app billing awareness (agents/studio/agency check subscription)

### 5. Production Monitoring [DEPLOYED 2026-03-06]

- [x] Alertmanager config deployed with real Resend SMTP credentials and `ALERT_EMAIL=subasiarhan3@gmail.com`
- [x] Test alert fired and routed to `critical-alerts` receiver
- [x] Prometheus, node-exporter, redis-exporter all running and healthy

### 6. SEO: Google Search Console [NEEDS ACCOUNT ACCESS]

Sitemaps serving: `recoder.xyz` (200), `agents.recoder.xyz` (200), `pm.recoder.xyz` (200).

- [ ] Verify domain ownership in GSC (DNS TXT via Cloudflare)
- [ ] Submit top 3 sitemaps

### 7. Unified User Experience [FUTURE]

Design tokens package created. Subscription endpoint exists. Ecosystem architecture documented. Cross-app navigation (AppSwitcher) deployed to all apps.

Future items:
- [ ] Shared notification system (cross-app: agent completed task, PM update, etc.)
- [ ] Unified settings (profile/avatar change on recoder.xyz reflects everywhere)
- [ ] Cross-app project linking (agent workspace ↔ PM project ↔ web IDE)
- [ ] Single dashboard (recoder.xyz shows activity across ALL apps)
- [ ] Billing awareness (all apps check subscription, show upgrade prompts)
- [ ] Consistent theme consumption (all apps consume design tokens)

---

## Completed Work (Design Unification — 2026-03-06)

- **Roobert font**: Deployed to all 5 active apps (app, agents, agency, PM, web) via local woff2 variable fonts
- **Orange/purple palette**: Unified across all apps — orange primary (#F79009), purple secondary (#A855F7)
- **Design tokens**: `@recoder/design-tokens` package updated (v0.2.0) with canonical HSL palette + CSS custom properties file
- **Agency font**: Switched from DM Sans/Mono to Roobert; blue accent (#0087f6) replaced with orange
- **PM font**: Switched from Geist to Roobert; purple/violet replaced with orange across all sub-apps (web, app, portal, editor, design-system)
- **Web IDE font**: Added @font-face Roobert declarations, removed Google Fonts dependency
- **Agents color fix**: Primary set to orange OKLCH, hardcoded bg-black replaced with theme token
- **Agency data**: Lobby wired to real DB queries (recent apps/workflows via Drizzle ORM), showcase playlists/favorites persisted to localStorage, tasks page cleaned up
- **PM AppSwitcher**: Added to authenticated sidebar; portal global-error.tsx restyled with branded layout
- **Studio**: Abandoned — no longer active
- **Build verification**: app/, agents, web all build clean; PM TypeScript now compiles clean (tsc --noEmit passes); agency build handled separately

## Completed Work (Phase 14 Summary)

All of these are done and do not need further action:

- **Services**: All 9 services verified online and healthy
- **Logos**: Correct geometric cube logo across all apps; wrong SVGs/PNGs identified and cleared
- **Branding**: Kortix/Suna/Giselle/Eververse/haydenbleasel references cleaned across all active apps
- **Auth UI**: Signin/signup pages upgraded with animated gradients, GDPR consent, email provider detection
- **Cross-app nav**: AppSwitcher deployed to agents, agency, PM, studio; all use `getSwitcherApps()` from ecosystem-config
- **Error pages**: Branded error.tsx and not-found.tsx added to all apps
- **SEO**: Sitemaps, robots.txt, JSON-LD, OG metadata verified on all apps
- **Localhost hardcoding**: Production-leaking localhost URLs fixed across all services
- **Database schema**: Prisma migrations baselined, executable runtime `prisma.user` vs `prisma.users` mismatches fixed (remaining `prisma.user` references are generated auth-client types / templates only), analytics queue repair migration added, and agency runtime now rejects non-Postgres/localhost DB URLs in production for both `DATABASE_URL` and `AUTH_DATABASE_URL`
- **Email templates**: Hardened against localhost links, branding corrected
- **CSP/proxy**: Nginx CSP updated for Stripe, auth delegation, analytics
- **Monitoring infra**: Health endpoints, PM2 restart policies, log rotation, SSL, backup restore all verified

## Completed Work (Code Quality & Security Sweep — 2026-03-06)

### Mock/Stub Cleanup
- recoder-app: Rewrote About page (removed fake team/stats), Learn page (removed fake courses/certs)
- recoder-agency: Removed mock playlists, mock lobby data, fake setTimeout API calls, debug console.logs
- recoder-studio: Fixed hardcoded favoriteCount
- recoder-pm: Removed debug console.logs, fixed rel="noopener noreferrer"

### Security Hardening
- **Rate limiting**: Added to verify-email, verify-code, forgot-password auth routes (recoder-app)
- **OAuth validation**: Added startup validation for GOOGLE_CLIENT_ID/SECRET, GITHUB_ID/SECRET; production guard requires at least one OAuth provider configured
- **SQL injection**: Fixed ORDER BY clause injection in backend agent_service.py and repo.py — sort direction/column now whitelisted
- **Webhook auth**: Added HMAC secret verification + try-catch + null checks to all recoder-pm webhook handlers
- **CSP**: Removed `http://localhost:*` from presentations API Content-Security-Policy
- **Bare excepts**: Fixed 8+ Python bare except clauses to catch specific exceptions (ValueError, OSError, json.JSONDecodeError)

### Code Quality
- Removed hardcoded Stripe test key from recoder-agents checkout (requires env var now)
- Removed debug `console.log` statements from `app` route handlers (`app/api/webhook`, `app/api/auth/cli`) and in-scope recoder-agents trigger config flow
- Removed debug `console.log`/`console.debug` statements across `recoder-agents/src` (AST sweep; verification scan now clean)
- P1 design baseline started on active apps: Roobert shell font applied to `app`, `agency`, and PM web/app layouts; PM authenticated app now includes shared AppSwitcher; PM primary accent moved to orange in design-system globals
- Fixed Sentry monitoring route example.com fallback
- Fixed dead route link `/stage/app-detail/` → `/stage/showcase/` in agency
- Removed alert() stubs from archive functionality
- Consolidated auth-helper.ts + auth-helpers.ts into single file
- Fixed recoder-agents API integration callback params crash
- Fixed useCallback missing dependency in agents page
- Changed mobile API fallback from localhost:3000 → recoder.xyz
- Reconciled `docker-backend` A2A TypeScript drift to current shared contracts:
  - removed stale local `@recoder/shared/a2a` shim
  - added legacy compatibility bridges in task lifecycle + agent registry
  - fixed CJS-safe OpenAPI path resolution and A2A metric field drift
  - `pnpm --dir docker-backend build` now passes
- Hardened `recoder-agents` build-time auth env handling with safe fallback `AUTH_DATABASE_URL`
  - `pnpm --dir recoder-agents build` now passes without shell-provided DB URL
- Revalidated shared/backend code health:
  - `pnpm --dir shared typecheck` passes
  - `cd backend && uv run pytest -q tests/core/test_trace_context.py` passes (`24 passed`)
  - `cd backend && uv run python -m py_compile api.py` passes
- Hetzner safe disk cleanup pass completed:
  - `journalctl --vacuum-size=100M`
  - removed unused repo-level caches/venv: `.venv`, `.aitimemachine`, `.uv-cache`, `.pnpm-store`
  - disk moved from 0 available to ~`855M` available on `/dev/sda1`
- Cross-service build/check sweep executed:
  - passing: `pnpm --dir app typecheck`, `pnpm --dir docker-backend build`, `pnpm --dir recoder-agents build`, `pnpm --dir shared typecheck`, `backend` targeted validation (`24 passed`, `py_compile` pass)
  - passing:
    - `pnpm --dir openclaw check` (types + lint + format all pass after lint/format burn-down)
- Additional sweep remediation completed:
  - `pnpm --dir recoder-web typecheck` now passes after dependency and typing fixes (codemirror/MCP/sdk optional provider typings).
  - `pnpm --dir openclaw exec tsgo` passes.
  - `pnpm --dir openclaw lint` passes after lint burn-down in workflow/cli/session commands and extension tests (copilot-proxy, discord, telegram, memory-core, msteams).
  - `pnpm --dir openclaw check` now passes end-to-end after applying `oxfmt` in `openclaw`.

---

## Completed Work (PM TypeScript Build Fix — 2026-03-07)

- **TypeScript compilation**: All ~40 pre-existing type errors resolved; `tsc --noEmit` passes with zero errors
- **null vs undefined**: Fixed imageUrl/avatar src mismatches across ~20 files; Avatar/AvatarTooltip components now accept `string | null`
- **Prisma strict types**: Cast JSON fields to `InputJsonValue`, used `Prisma.DbNull` for JSON nulls, cast update data through `Prisma.*UpdateInput`
- **Prisma enum casts**: String search params cast to proper enum types (`analytics_provider`, `session_recording_source`, `ai_job_status`, etc.)
- **React 19 JSX**: `ReactElement` → `ReactNode` for children props, added missing `children` prop to feedback editor
- **Auth type migration**: `email_confirmed_at` → `emailVerified`, `created_at` → `createdAt` in all references
- **log.error unknown**: Cast catch errors to `Record<string, unknown>` in 7 backend files
- **Type declarations**: Added `adm-zip.d.ts` for missing module types
- **Enum types**: Used `RecoderPmRole.Member` instead of string literal `"MEMBER"`
- **Env validation**: Made Polar, GitHub App, Logo.dev keys optional; added `SKIP_ENV_VALIDATION` support; safe PostHog server init
- **Build blocker**: Full `next build` requires active Neon database (current free tier quota exceeded); TypeScript layer is clean

## Completed Work (Agency Build — 2026-03-07, separate agent)

- Status: Being handled by a separate agent session
- Known issues: `@giselles-ai/*` package rename drift, Drizzle schema types

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

## Abandoned Projects

### recoder-studio (studio.recoder.xyz)
- Status: **Abandoned / frozen**
- Policy:
  - No new feature development planned.
  - Only critical break/fix or security patches may be applied if needed.
  - Product roadmap and UX investment are focused on `recoder.xyz`, `recoder-agents`, `recoder-agency`, and `recoder-pm`.
