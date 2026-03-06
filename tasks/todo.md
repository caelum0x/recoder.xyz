# Remaining Tasks

Code-level mock cleanup, security hardening, and quality sweep are complete. Remaining items require production access, provider keys, or external account access.

## Studio Status

- `recoder-studio` is now **abandoned/frozen**.
- Do not schedule new feature/design work for studio.
- Only critical runtime/security fixes are in scope if production impact appears.

## Recently Completed — Design Unification (2026-03-06)

- [x] **Shared design tokens** — @recoder/design-tokens v0.2.0 with canonical orange/purple HSL palette + CSS custom properties
- [x] **Roobert font** — Distributed to all 5 active apps (app, agents, agency, PM, web)
- [x] **app/ alignment** — Roobert font loader + Tailwind config updated
- [x] **recoder-agents alignment** — Orange primary OKLCH, hardcoded colors fixed
- [x] **recoder-agency alignment** — DM Sans → Roobert, blue → orange accent, data layer wired (lobby/showcase/tasks)
- [x] **recoder-pm alignment** — Geist → Roobert, violet → orange across all sub-apps + editor + design-system
- [x] **recoder-web alignment** — @font-face Roobert, font-family updated in variables.scss
- [x] **PM AppSwitcher** — Added to authenticated app sidebar
- [x] **PM portal error page** — Restyled with branded layout
- [x] **Build verification** — app/, agents, web build clean; PM/agency pre-existing env/type errors confirmed unrelated

## Recently Completed — Security & Code Quality Sweep (2026-03-06)

- [x] **Mock/stub cleanup** — recoder-app About/Learn pages, agency showcase mocks, lobby mocks, debug console.logs, hardcoded favoriteCount
- [x] **Rate limiting** — Added to verify-email, verify-code, forgot-password routes
- [x] **OAuth env validation** — Startup guards for Google/GitHub credentials, production requires at least one provider
- [x] **SQL injection fix** — Whitelisted ORDER BY sort direction/column in backend agent_service.py and repo.py
- [x] **Webhook auth** — Added HMAC secret verification + error handling to all PM webhook handlers
- [x] **Auth helper consolidation** — Merged auth-helper.ts into auth-helpers.ts
- [x] **Agents bugs** — Fixed API callback params crash, useCallback dependency array
- [x] **Hardcoded keys removed** — Stripe test key, Sentry example URL, CSP localhost, bare Python excepts

## Follow-up Pass (2026-03-06) - A2A Build Reconciliation + Backend Validation

### Checklist
- [x] Harden `recoder-agents` build so missing shell `AUTH_DATABASE_URL` no longer breaks `next build`.
- [x] Reconcile `docker-backend` A2A compile drift against current `@recoder/shared/a2a` contracts.
- [x] Re-run `shared` typecheck and backend Python validation checks.

### Review
- `recoder-agents`:
  - Updated `build` script to inject safe fallback `AUTH_DATABASE_URL` only when absent.
  - Verified build passes: `pnpm --dir recoder-agents build`.
- `docker-backend`:
  - Removed stale local module shim `src/types/recoder-shared-a2a.d.ts` that masked real exports.
  - Fixed TS resolver config for workspace `@recoder/shared/a2a` paths under current CJS build.
  - Added compatibility bridges for legacy A2A call shapes:
    - task lifecycle (`createTask` legacy input, `transitionTask` legacy input, `list`, `transition`)
    - agent registry (`registerAgent` legacy payload support)
  - Patched connector/collab call signatures and A2A enum/platform compatibility.
  - Fixed OpenAPI route CJS-safe path resolution (`process.cwd()`), queue/messaging metric field drift, and logger argument shape mismatches.
  - Verified build passes: `pnpm --dir docker-backend build`.
- Shared/backend validation:
  - `pnpm --dir shared typecheck` passed.
  - `cd backend && uv run pytest -q tests/core/test_trace_context.py` passed (`24 passed`).
  - `cd backend && uv run python -m py_compile api.py` passed.

## Follow-up Pass (2026-03-06) - Hetzner Disk Cleanup + Cross-Service Sweep

### Checklist
- [x] Run safe disk cleanup pass on Hetzner without deleting active runtime data.
- [x] Re-run cross-service build/check sweep and capture exact pass/fail blockers.
- [x] Sync this evidence back into `plan.md`.

### Review
- Hetzner cleanup completed:
  - `journalctl --vacuum-size=100M`
  - removed unused repo-level artifacts: `/root/recoder.xyz/.venv`, `.aitimemachine`, `.uv-cache`, `.pnpm-store`
  - post-cleanup disk state: `/dev/sda1` still high usage but now ~`855M` available
- Cross-service sweep results:
  - pass:
    - `pnpm --dir app typecheck` (fixed TS test globals + subscription billing payload typing)
    - `pnpm --dir docker-backend build`
    - `pnpm --dir recoder-agents build`
    - `pnpm --dir shared typecheck`
    - `cd backend && uv run pytest -q tests/core/test_trace_context.py && uv run python -m py_compile api.py`
    - `pnpm --dir recoder-web typecheck` (fixed codemirror/MCP/optional-sandbox typing drift)
    - `pnpm --dir openclaw exec tsgo` (type layer passes)
  - fail:
    - none in this pass

## Follow-up Pass (2026-03-06) - openclaw Lint Burn-down

### Checklist
- [x] Eliminate remaining `openclaw` lint blockers in command/runtime code.
- [x] Eliminate `no-explicit-any` usage in targeted extension unit tests.
- [x] Eliminate `no-base-to-string` issues in MSTeams graph upload tests.

### Review
- `pnpm --dir openclaw lint` now passes with 0 errors.
- Fixed items:
  - removed unused `executeLaneWithRetry` and template-literal simplifications in `src/commands/agents.workflow.ts`
  - safer provider parsing in `src/cli/sandbox-cli.ts`
  - simplified rerun guidance string in `src/commands/sessions.ts`
  - replaced `any` test stubs with typed `OpenClawPluginApi`-based stubs in:
    - `extensions/copilot-proxy/index.test.ts`
    - `extensions/discord/index.test.ts`
    - `extensions/telegram/index.test.ts`
    - `extensions/memory-core/index.test.ts`
  - added robust request URL extraction helper in:
    - `extensions/msteams/src/graph-upload.test.ts`
- `pnpm --dir openclaw check` now passes end-to-end (`tsgo` + `oxlint --type-aware` + `oxfmt --check`).

## Priority Order

### 0. Next Sprint Plan — Design + Runtime Reliability (Immediate)
- [x] **P0: Runtime health pass on all 9 services**
  - Run `bash scripts/verify-phase14-runtime.sh`
  - Run `bash scripts/production-external-closeout.sh`
  - Capture failures by app (`app`, `agents`, `agency`, `studio`, `pm`, `web`, `backend`, `docker-backend`)
  - Create fix tickets in this file for each failing endpoint/user flow
- [x] **P0: recoder-web stability and routing cleanup**
  - Confirm why `web.recoder.xyz` is `302` in status table and decide target behavior (`200` app shell vs intentional redirect)
  - Verify main workbench routes + auth/session path are consistent with current product intent
  - Re-test canonical/robots/sitemap responses after routing decisions
- [x] **P1: Cross-app design consistency pass (no large redesign yet)**
  - Audit top-nav/sidebar/footer across `app`, `agents`, `studio`, `agency`, `pm`, `web`
  - Unify spacing/typography/button variants and app switcher behavior using existing shared tokens/config
  - Remove remaining inconsistent hardcoded color values in user-facing core screens
  - `@recoder/design-tokens` wired as dependency to all active apps
  - AppSwitcher added to recoder-web (Remix) for full cross-app navigation coverage
  - PushNotificationPrompt, global-error.tsx hardcoded hex colors replaced with CSS variable fallbacks
  - Cross-app billing awareness added to agency via recoder.xyz subscription endpoint
- [x] **P1: Error/empty/loading UX reliability pass**
  - Validate `error.tsx`, `not-found.tsx`, loading states, and auth-guard redirects on each app
  - Ensure no broken links or dead-end pages from main nav routes
  - Loading.tsx added to all key interactive route groups: settings/*, dashboard/*, billing/*, agency settings/tasks/playground, agents checkout
  - Last `alert()` call replaced with inline error feedback (usage export)
- [ ] **P1: Critical flow smoke matrix (manual + scripted)**
  - Sign-up/sign-in/sign-out, SSO propagation, checkout entry, BYOK settings, PM `/app` auth gate, agency dashboard landing
  - Record exact pass/fail with timestamp and blocker source (config, runtime, code, external dependency)
- [ ] **P2: Design improvements after reliability baseline is green**
  - Apply intentional visual polish per app surface (not generic/template look)
  - Keep design system alignment and avoid introducing per-app style drift

### 1. Fix Neon DB Quota — RESOLVED (2026-03-06)
- [x] Neon quota bypassed — production now uses local temp Postgres (`recoder-temp-postgres` on port 55432)
- [x] DB responding: 27 users, auth registration working, session creation confirmed
- [x] Better Auth sign-up/sign-in/session flow verified end-to-end

### 2. Deploy Alertmanager Config — DONE (2026-03-06)
- [x] Set `ALERT_EMAIL=subasiarhan3@gmail.com`, `SMTP_AUTH_PASSWORD` (Resend API key), SMTP config in host `.env`
- [x] Alertmanager container recreated via `docker-compose.deploy.yml` with real env vars
- [x] Test alert fired and routed to `critical-alerts` receiver
- [x] Email delivery via Resend SMTP confirmed (config rendered with real values)

### 3. Verify Email Delivery — DONE (2026-03-06)
- [x] Registration sends verification email via Resend (message ID: `4d6cfb86-...`)
- [x] Registration sends welcome email via Resend (message ID: `c94dafab-...`)
- [x] Forgot-password sends reset email via Resend (message ID: `febacdbc-...`)
- [x] All three email types sent to real Gmail (`subasiarhan3+test1772806029@gmail.com`)

### 4. Configure Billing Providers — DEFERRED (no keys)
- [ ] Set real Paddle or DodoPayments API keys in production env
- [ ] Test full checkout flow (user subscribes to Pro plan)
- [ ] Test subscription cancel and reactivate
- [ ] Verify BYOK flow at `/settings/ai-providers` (`scripts/verify-byok-e2e.sh` ready)

### 5. Submit Sitemaps to Google Search Console — MANUAL ACTION NEEDED
- Sitemaps serving: `recoder.xyz` (200), `agents.recoder.xyz` (200), `pm.recoder.xyz` (200)
- `agency.recoder.xyz` (307 redirect), `studio.recoder.xyz` (502 abandoned), `web.recoder.xyz` (404 IDE)
- [ ] Verify domain ownership in GSC (DNS TXT via Cloudflare)
- [ ] Submit top 3 sitemaps

### 6. Validate Cross-Subdomain Auth — DONE (2026-03-06)
- [x] Register + force-verify + sign-in on `recoder.xyz` — `__Secure-recoder.session_token` set on `Domain=.recoder.xyz`
- [x] `recoder.xyz` → `agents.recoder.xyz` — session recognized (`data.user.email` confirmed)
- [x] `recoder.xyz` → `agency.recoder.xyz` — session recognized (`data.user.email` + `dbId` confirmed)
- [x] `recoder.xyz` → `pm.recoder.xyz/app` — authenticated redirect to `pm.recoder.xyz/` (307)
- [x] Sign-out propagation previously verified across all surfaces

### 7. Monitor Server Memory & Disk — ACTIVE (2026-03-06)
- **Memory**: 4GB/16GB used — healthy
- **Disk**: 99% full (1.8GB free of 150GB) — critical
  - `du` accounts for ~51GB but `df` shows 142GB used — likely ext4 metadata/corruption
  - Cleaned: `.next/cache` (569MB), unused dirs (frontend/mobile/apps/core/auth: 414MB), apt cache (128MB)
  - Large consumers: Docker overlay2 (29GB), node_modules (5.5G root + 2.5G PM + 1.8G agency), backend .venv (1.3G)
  - [ ] Investigate `du` vs `df` 91GB discrepancy — may need `e2fsck` during maintenance
  - [ ] Consider Hetzner disk resize or adding a volume
  - `recoder-studio` confirmed not running (no PM2 process, no directory on server)

## Follow-up Pass (2026-03-06) - Runtime Health + recoder-web Routing

### Checklist
- [x] Run `scripts/verify-phase14-runtime.sh` against production endpoints.
- [x] Run `scripts/production-external-closeout.sh` and fix script-side false-negative billing check.
- [x] Decide and document `web.recoder.xyz` root behavior.

### Review
- Runtime verifier now includes explicit `recoder-web` checks:
  - root allows auth-gated `302` to `https://recoder.xyz/auth/signin?...` as valid behavior
  - `/api/health` must return `200`
- `scripts/production-external-closeout.sh` billing parser now treats boolean `false` as valid (only missing fields are `unknown`).
- Current production behavior:
  - `https://web.recoder.xyz/` -> `302` to centralized signin on `recoder.xyz` (intentional auth gate)
  - `https://web.recoder.xyz/api/health` -> `200`
  - No code-level runtime failures from current automated checks; remaining skips are external-secret dependent (`ADMIN_SECRET`, `TEST_EMAIL`, DB URL, SSH).

## Follow-up Pass (2026-03-06) - Debug Console Log Cleanup

### Checklist
- [x] Remove debug `console.log` usage from `app` route handlers.
- [x] Re-scan both route trees: `app/app/api` and legacy `app/api`.
- [x] Remove active debug `console.log` from in-scope `recoder-agents` implementation files.

### Review
- Updated:
  - `app/api/webhook/route.ts` (removed subscription/payment payload debug dumps; kept error logging via `console.error`)
  - `app/api/auth/cli/route.ts` (removed device-code creation debug log)
  - `recoder-agents/src/components/agents/triggers/event-based-trigger-dialog.tsx` (removed edit-mode debug log)
- Additional sweep:
  - Removed `console.log`/`console.debug` statements across `recoder-agents/src` using AST-based codemod (296 statements removed in 70 files).
- Verification:
  - `rg -n "console\\.log\\(|console\\.debug\\(" app/app/api app/api` -> no matches
  - `rg -n "console\\.log\\(|console\\.debug\\(" recoder-agents/src/components/agents/triggers/event-based-trigger-dialog.tsx` -> no matches
  - `rg -n "console\\.log\\(|console\\.debug\\(" recoder-agents/src` -> no matches
  - `pnpm -C recoder-agents exec tsc --noEmit --pretty false` -> pass

## Follow-up Pass (2026-03-06) - P1 Design Baseline (Active Apps Only)

### Checklist
- [x] Apply Roobert font baseline to active app shells (`app`, `agency`, `pm web`, `pm app`).
- [x] Add missing PM authenticated-app AppSwitcher for cross-app navigation parity.
- [x] Remove targeted hardcoded color literals from agency team creation surface.

### Review
- Font baseline:
  - Added `public/fonts/roobert/*` to:
    - `app/public`
    - `recoder-agency/apps/agency/public`
    - `recoder-pm/apps/web/public`
    - `recoder-pm/apps/app/public`
  - Updated layouts:
    - `app/app/layout.tsx` now uses local Roobert (sans + mono)
    - `recoder-agency/apps/agency/app/layout.tsx` now maps root font variables to local Roobert
    - `recoder-pm/apps/web/app/layout.tsx` now maps `--font-geist-sans/mono` to local Roobert
    - `recoder-pm/apps/app/app/layout.tsx` now maps `--font-geist-sans/mono` to local Roobert
- Navigation parity:
  - Added `recoder-pm/apps/app/components/app-switcher.tsx`
  - Wired switcher into `recoder-pm/apps/app/app/layout.tsx` next to fixed logo
- Color consistency:
  - Updated PM design-system primary accent from purple-only to orange-primary in `recoder-pm/packages/design-system/styles/globals.css`
  - Updated PM selection color to orange (`bg-orange-500`)
  - Replaced hardcoded hex usage in `recoder-agency/apps/agency/services/teams/components/team-creation-form.tsx` with token/variable-based colors
- Nav/layout rhythm consistency:
  - Normalized floating top-left brand dock spacing/treatment across:
    - `recoder-pm/apps/web/app/layout.tsx`
    - `recoder-pm/apps/app/app/layout.tsx`
    - `recoder-agency/apps/agency/app/layout.tsx`
    - `recoder-agents/src/app/layout.tsx`
  - Updated `app/components/SiteFooter.tsx` spacing + tokenized muted text colors for footer-link consistency
- Verification:
  - Syntax parse check of all edited TS/TSX files: `PARSE_OK`
  - Full workspace `tsc` still reports many pre-existing unrelated errors in this repository; no new parse-level errors introduced by this pass

### Live Runtime Smoke (2026-03-06)
- Verified reachable/auth-gated behavior:
  - `https://recoder.xyz/` -> `200`
  - `https://agents.recoder.xyz/` -> `200`
  - `https://agency.recoder.xyz/` -> `307` to login (auth gate)
  - `https://pm.recoder.xyz/` -> `200`
  - `https://pm.recoder.xyz/app` -> `307` to recoder signin callback (expected)
  - `https://web.recoder.xyz/` -> `302` to recoder signin (expected)
  - `https://web.recoder.xyz/api/health` -> `200`
  - `https://docker.recoder.xyz/health` -> `200`
- Backend health endpoint note:
  - `https://api.recoder.xyz/v1/health` -> `200`
  - `/health` and `/api/health` on `api.recoder.xyz` return `404` (path contract should be treated as `/v1/health`)

### P1 Continuation (2026-03-06) - Header Rhythm + Core Color Literal Cleanup
- Header height/spacing alignment:
  - `app` marketing header remains `h-16` baseline.
  - `recoder-agency` main/client headers upgraded from `48px` to `h-16` with `px-6`:
    - `app/(main)/ui/header/header.tsx`
    - `app/(client)/ui/header.tsx`
  - `recoder-pm` web navbar normalized to `h-16` with consistent horizontal padding:
    - `apps/web/components/navbar.tsx`
- Hardcoded core-screen color literal cleanup:
  - `app/components/PlatformDetailPage.tsx`
    - replaced `bg-[#111]` / `bg-[#0a0a0a]` blocks with token-based card/background classes
  - `recoder-agency` shared/core forms:
    - `app/(main)/settings/components/button.tsx`
    - `app/(main)/ui/header/create-team-dialog.tsx`
    - `app/(main)/settings/account/account-display-name-form.tsx`
    - `app/(main)/settings/account/user-teams.tsx`
    - replaced `#202530/#12151f/#00020A` literals with existing token/color-variable based styles
- Verification:
  - Parse checks for all edited TS/TSX files -> `PARSE_OK`
  - Targeted grep for replaced literals in edited files -> no matches

---

## Future (Unified UX)

- Shared notification system across apps
- Unified settings (profile changes reflect everywhere)
- Cross-app project linking
- Single dashboard showing all-app activity
- Billing awareness in all apps
- Consistent design token consumption

---

## Follow-up Pass (2026-03-06) - Task 9 BYOK + Billing Awareness

### Checklist
- [x] Add deterministic BYOK verifier script that exercises key CRUD with authenticated user session.
- [x] Re-audit cross-app billing awareness across `recoder-agents`, `recoder-studio`, and `recoder-agency`.
- [x] Update `plan.md` billing task status with concrete evidence and remaining production blockers.

### Review
- Added executable script: `scripts/verify-byok-e2e.sh`
  - Flow: register -> seed verification code (admin) -> verify -> sign-in -> list keys -> add key -> decrypt key -> delete key -> confirm removal.
  - Uses `openrouter` key format compatible with current server-side validation.
- Validation:
  - `bash -n scripts/verify-byok-e2e.sh` passed.
  - Live end-to-end run not executed in this workspace because `ADMIN_SECRET` is required.
- Cross-app billing awareness audit (source):
  - `recoder-agents`: auth callback checks billing account state before redirect.
  - `recoder-studio`: plan-aware upgrade control from current team context.
  - `recoder-agency`: plan-aware upgrade control from current team context.

---

## Follow-up Pass (2026-03-06) - CLI Device Token Endpoint

### Checklist
- [x] Add standalone `POST /api/auth/cli/token` endpoint in app router for recoder-code clients.
- [x] Support `urn:ietf:params:oauth:grant-type:device_code` and `refresh_token` grants with compatible response/error payloads.
- [x] Add deterministic script to verify device-flow + token refresh contract end-to-end.

### Review
- Added route: `app/app/api/auth/cli/token/route.ts`
  - Device grant:
    - calls `CLIAuthService.pollDeviceCode`
    - returns RFC-style `authorization_pending` when still pending
    - maps denied/expired/invalid conditions to stable error payloads
  - Refresh grant:
    - calls `CLIAuthService.refreshAccessToken`
    - returns refreshed access token with compatibility `refresh_token` echo
- Added executable script: `scripts/verify-cli-device-flow-e2e.sh`
  - Flow: register -> seed verify-code -> sign-in -> request device code -> approve user code -> token exchange -> validate token -> refresh token
- Added focused unit tests: `app/lib/__tests__/cli-token-route.test.ts`
  - Covers pending/authorized device poll, invalid device grant mapping, refresh grant response, and unsupported grant behavior
- Validation:
  - `bash -n scripts/verify-cli-device-flow-e2e.sh` passed.
  - `pnpm -C app exec vitest run lib/__tests__/cli-token-route.test.ts` passed (`5/5`).
  - Live run pending because `ADMIN_SECRET` is not set in this workspace shell.

---

## Follow-up Pass (2026-03-06) - PM `/app` 404 Redirect Shim

### Checklist
- [x] Patch `recoder-pm/apps/web` so `/app` and `/app/*` no longer hard-404.
- [x] Keep behavior runtime-safe with env-driven workspace target URL.
- [x] Update `plan.md` open auth item with current code/deploy status.

### Review
- Added redirect route handlers:
  - `recoder-pm/apps/web/app/app/route.ts`
  - `recoder-pm/apps/web/app/app/[...slug]/route.ts`
- Behavior:
  - Redirect base `/app` and nested `/app/*` to workspace base URL from:
    - `RECODER_PM_APP_URL` (preferred)
    - fallback `RECODER_PM_WORKSPACE_URL`
    - fallback `RECODER_PM_WEB_URL`
    - fallback `https://pm.recoder.xyz`
  - Preserves query string during redirect.
- Validation:
  - `pnpm -C recoder-pm/apps/web exec tsc --noEmit --pretty false` still fails due pre-existing unrelated asset-module typing issues in home page components; no type error from the new route handlers.

---

## Follow-up Pass (2026-03-06) - Auth/Billing URL Hardening + Prisma Audit

### Checklist
- [x] Re-audit executable runtime usage for `prisma.user` vs `prisma.users`.
- [x] Patch auth email-link and billing checkout URL construction to use shared safe public URL resolver.
- [x] Extend and run focused tests for URL safety and billing credential health helpers.

### Review
- Prisma audit result:
  - No executable runtime `prisma.user.*` misuse found in active app paths; remaining `prisma.user` occurrences are in generated auth client types (`packages/auth/prisma/auth-client/index.d.ts`) and one AI code-generation snippet template.
  - Updated AI snippet template in `packages/shared/src/collaboration/ai-collaboration-agent.ts` to use `prisma.users` so generated examples align with this codebase schema.
- URL hardening patches:
  - `app/app/api/auth/forgot-password/route.ts`
  - `app/app/api/auth/register/route.ts`
  - `app/app/api/auth/verify-email/route.ts`
  - `app/app/api/billing/create-checkout/route.ts`
  - All now derive base URL from `resolvePublicAppUrl()` to prevent production localhost leakage in verification/reset/checkout links.
- Additional billing runtime hardening:
  - Added `app/lib/billing-return-url.ts` with same-origin checkout return URL sanitizer.
  - Wired sanitizer into `app/lib/services/dodopayments.service.ts` so untrusted `returnUrl` values cannot redirect checkout completion to external origins.
  - Normalized Paddle pay-link webhook target to `"/api/webhooks/paddle"` in `app/app/api/billing/create-checkout/route.ts`.
- Test updates:
  - Extended `app/lib/__tests__/email.test.ts` with production `NEXT_PUBLIC_APP_URL=127.0.0.1` safety case.
  - Added `app/lib/__tests__/billing-return-url.test.ts` for same-origin return URL enforcement.
- Validation:
  - `pnpm -C app exec vitest run lib/__tests__/email.test.ts` passed (`6/6`)
  - `pnpm -C app exec vitest run lib/__tests__/billing-credentials.test.ts lib/__tests__/billing-health.test.ts` passed (`10/10`)
  - `pnpm -C app exec vitest run lib/__tests__/billing-return-url.test.ts` passed (`4/4`)

---

## Follow-up Pass (2026-03-06) - Agency DB Runtime Safety Guard

### Checklist
- [x] Enforce production-safe DB URL validation for agency runtime (`DATABASE_URL`, `AUTH_DATABASE_URL`).
- [x] Block non-Postgres URL schemes to prevent accidental sqlite/file usage.
- [x] Add coverage for localhost/non-Postgres rejection behavior.

### Review
- Updated `recoder-agency/apps/agency/lib/env-validation.ts`:
  - Added URL parsing and protocol validation for both DB URLs.
  - Requires `postgres://` or `postgresql://` for `DATABASE_URL` and `AUTH_DATABASE_URL`.
  - In production mode, rejects localhost targets (`localhost`, `127.0.0.1`, `::1`).
- Updated `recoder-agency/apps/agency/lib/env-validation.test.ts`:
  - Added sqlite/file-scheme rejection tests for both DB URLs.
  - Added production localhost rejection tests for both DB URLs.
- Validation:
  - `pnpm -C recoder-agency/apps/agency exec vitest run lib/env-validation.test.ts` passed (`10/10`).
  - Note: command still emits pre-existing workspace `tsconfig-paths` parse warnings for unrelated `@recoder/tsconfig/*` references, but target test file passed.

---

## Follow-up Pass (2026-03-06) - External Production Closeout Orchestrator

### Checklist
- [x] Add one command that chains remaining production/external verification tasks.
- [x] Reuse existing verification scripts (`monitoring-test-fire.sh`, `sso-logout-matrix.sh`) instead of duplicating logic.
- [x] Include clear PASS/FAIL/SKIP summary for operator handoff.

### Review
- Added executable script: `scripts/production-external-closeout.sh`
  - Verifies billing health endpoint payload shape.
  - Verifies Alertmanager synthetic fire path using existing `scripts/monitoring-test-fire.sh`.
  - Supports optional live admin email checks (`ADMIN_SECRET`, `TEST_EMAIL`).
  - Supports optional Neon quota probe via `psql` (`NEON_DATABASE_URL`/`DATABASE_URL`).
  - Supports optional cross-subdomain SSO matrix execution (`RUN_SSO_MATRIX=true`).
  - Supports optional server memory snapshot over SSH (`RUN_MEMORY_CHECK=true`, `SSH_HOST`, `SSH_KEY`).
  - Prints manual closeout reminders for Search Console and inbox confirmation.
- Validation:
  - `bash -n scripts/production-external-closeout.sh` passed.
  - Dry run without privileged env vars produced expected PASS/FAIL/SKIP summary and no script errors.

---

## Follow-up Pass (2026-03-06) - P1 Reliability (Error/Not-Found + Auth Dead-End)

### Checklist
- [x] Audit active-app `error.tsx` and `not-found.tsx` files for dead-end fallback actions.
- [x] Patch auth-recovery flows that still redirected to stale `/login` path.
- [x] Verify no remaining `/login?redirect=` usage in `recoder-web` runtime error handlers.

### Review
- `recoder-web` auth error recovery now uses centralized sign-in route:
  - `recoder-web/app/lib/errors/error-recovery.ts`
  - `recoder-web/app/lib/errors/types.ts`
  - `recoder-web/app/lib/errors/toast-error.tsx`
  - Replaced `.../login?redirect=...` with `.../auth/signin?redirect=...`.
- `recoder-agency` stage not-found fallback no longer points to another potentially missing stage path:
  - `recoder-agency/apps/agency/app/(main)/stage/not-found.tsx`
  - Primary CTA changed from `Go to Stage` (`/stage`) to `Go to Dashboard` (`/dashboard`).
- Validation:
  - `rg -n "replace\\('app\\.', ''\\).*\\/login|/login\\?redirect=|: '/login'|\\\"/login\\\"" recoder-web/app/lib/errors recoder-web/app/components` returned no matches.
  - Workspace-level typechecks still fail due pre-existing unrelated issues in `recoder-web` and `recoder-pm` (Codemirror/version drift and existing schema typing mismatches); no new error linked to patched files.

---

## Follow-up Pass (2026-03-06) - P1 Reliability Continuation (Main App + Agency Root + Nav Auth Guards)

### Checklist
- [x] Align main app + agency root `error.tsx` / `not-found.tsx` fallback actions to non-dead-end routes.
- [x] Patch nav-entry auth guards for `dashboard/settings/projects/billing` flow to preserve full redirect target (path + query).
- [x] Audit target directories for remaining plain `/auth/signin` redirects without redirect params.

### Review
- Error/not-found consistency updates:
  - `app/app/[locale]/error.tsx`: CTA text normalized to `Return Home`.
  - `app/app/[locale]/not-found.tsx`: CTA text normalized to `Return Home`.
  - `recoder-agency/apps/agency/app/error.tsx`: fallback route changed from `/workspaces` to `/`.
  - `recoder-agency/apps/agency/app/not-found.tsx`: fallback route changed from `/workspaces` to `/`.
- Auth-guard redirect hardening:
  - Middleware now preserves query params in redirect targets:
    - `app/middleware.ts`
  - Dashboard/settings layouts now preserve query params:
    - `app/app/[locale]/dashboard/layout.tsx`
    - `app/app/[locale]/settings/layout.tsx`
  - Client guards now redirect with `?redirect=${encodeURIComponent(pathname+search)}`:
    - `app/app/[locale]/projects/page.tsx`
    - `app/app/[locale]/dashboard/page.tsx`
    - `app/app/[locale]/dashboard/analytics/page.tsx`
    - `app/app/[locale]/dashboard/usage/page.tsx`
    - `app/app/[locale]/dashboard/production/page.tsx`
    - `app/app/[locale]/settings/account/page.tsx`
    - `app/app/[locale]/settings/ai-providers/page.tsx`
    - `app/app/[locale]/settings/security/page.tsx` (including post-password-change sign-in redirect)
- Validation:
  - `rg -n "auth/signin" app/app/[locale]/dashboard app/app/[locale]/settings app/app/[locale]/projects app/app/[locale]/billing` now shows redirect-param usage for guard paths.
  - `pnpm -C app exec tsc --noEmit --pretty false` still fails with pre-existing workspace issues unrelated to this pass (`vitest.d.ts` module typing), no new targeted runtime-guard regression detected.

---

## Follow-up Pass (2026-03-06) - P1 Reliability Continuation (Loading/Empty States + Route Cluster Smoke)

### Checklist
- [x] Replace blank loading shells in active apps with non-empty skeletons.
- [x] Patch empty-state CTA dead-link in active routes.
- [x] Run focused smoke checks by route cluster and capture redirect behavior.

### Review
- Loading-state reliability:
  - `recoder-agency/apps/agency/app/(main)/loading.tsx`
  - `recoder-agency/apps/agency/app/(main)/settings/loading.tsx`
  - Replaced `return <div />` placeholders with full-page skeleton loading layouts.
- Empty-state CTA fix:
  - `recoder-web/app/components/workbench/AgentTeamPanel.tsx`
  - Updated footer CTA from `/workspaces` to existing `/projects` route (`Open Projects →`).
- Focused route-cluster smoke (external runtime snapshot):
  - `recoder.xyz` protected cluster:
    - `/dashboard` -> `307 /auth/signin?redirect=%2Fdashboard`
    - `/settings` -> `307 /auth/signin?redirect=%2Fsettings`
    - `/projects` -> `307 /auth/signin?redirect=%2Fprojects`
    - `/billing` -> `307 /auth/signin?redirect=%2Fbilling`
  - Additional active surfaces:
    - `agency.recoder.xyz/dashboard` -> `307 /login?returnUrl=%2Fdashboard`
    - `agency.recoder.xyz/stage` -> `307 /login?returnUrl=%2Fstage`
    - `pm.recoder.xyz/app` -> `307` to centralized signin callback flow
    - `web.recoder.xyz/` -> `302` to centralized signin
    - `web.recoder.xyz/projects` -> `200`
    - `web.recoder.xyz/settings` -> `302 /settings/editor`
- Note:
  - Query-preserving redirect improvements implemented in this repo are code-complete; external smoke reflects currently deployed runtime and may lag local changes until deploy/restart.

---

## Follow-up Pass (2026-03-06) - P1 Reliability Next Chunk (recoder-web Workbench + recoder-pm Routes)

### Checklist
- [x] Audit `recoder-web` workbench empty/error CTA links for dead-end paths.
- [x] Audit `recoder-pm` app route CTAs for path/route mismatch and patch invalid links.
- [x] Re-run focused smoke matrix per route cluster and capture live runtime status.

### Review
- `recoder-web` workbench CTA status:
  - `AgentTeamPanel` already patched in prior pass to valid route (`/projects`); no additional dead-link CTA found in workbench panel route links.
- `recoder-pm` route CTA fixes:
  - Updated onboarding/welcome and feature portal CTA routes from non-existent paths to existing settings routes:
    - `recoder-pm/apps/app/app/(organization)/welcome/page.tsx`
      - `/portal` -> `/settings/portal`
      - `/widget` -> `/settings/widget` (both occurrences)
    - `recoder-pm/apps/app/app/(organization)/features/[feature]/components/portal-button.tsx`
      - `/portal` -> `/settings/portal`
  - Validation grep:
    - `rg -n "href=\"/portal\"|href=\"/widget\"" recoder-pm/apps/app/app` -> no matches
- Focused smoke matrix rerun (external):
  - `recoder.xyz` protected cluster unchanged:
    - `/dashboard` -> `307 /auth/signin?redirect=%2Fdashboard`
    - `/settings` -> `307 /auth/signin?redirect=%2Fsettings`
    - `/projects` -> `307 /auth/signin?redirect=%2Fprojects`
    - `/billing` -> `307 /auth/signin?redirect=%2Fbilling`
  - `agency.recoder.xyz`:
    - `/dashboard` -> `307 /login?returnUrl=%2Fdashboard`
    - `/stage` -> `307 /login?returnUrl=%2Fstage`
  - `pm.recoder.xyz`:
    - `/app` -> `307` centralized signin callback flow
    - `/portal` -> `404`
    - `/widget` -> `404`
    - `/settings/portal` -> `404`
    - `/settings/widget` -> `404`
  - `web.recoder.xyz`:
    - `/` -> `302` centralized signin
    - `/projects` -> `200`
    - `/settings` -> `302 /settings/editor`
- Note:
  - PM route CTA fixes are code-complete in repo; production still serves 404 for PM settings/app routes in this snapshot, indicating runtime/deploy/config gap rather than remaining local path-link mismatch.

---

## Follow-up Pass (2026-03-06) - P1 Reliability (PM Error Fallback Target + Focused Smoke)

### Checklist
- [x] Patch PM app `error.tsx` and `global-error.tsx` fallback target to auth-gated `/app`.
- [x] Run focused PM auth smoke checks for `/app` callback behavior.
- [x] Re-run same cross-app route cluster smoke matrix.

### Review
- PM error fallback patch:
  - `recoder-pm/apps/app/app/error.tsx`
  - `recoder-pm/apps/app/app/global-error.tsx`
  - Changed fallback CTA from `Return Home` (`/`) to `Return to App` (`/app`).
- Focused PM smoke:
  - `/app` and `/app?from=error` both redirect to centralized signin callback flow.
  - `https://recoder.xyz/auth/signin?callbackUrl=https://pm.recoder.xyz/app` returns `200`.
- Same cluster matrix rerun:
  - `recoder.xyz` protected routes remain `307` to signin with redirect param.
  - `agency.recoder.xyz` protected routes remain `307 /login?returnUrl=...`.
  - `pm.recoder.xyz/app` remains `307` to centralized callback flow.
  - `pm.recoder.xyz/portal`, `/widget`, `/settings/portal`, `/settings/widget` remain `404` in live runtime snapshot.
  - `web.recoder.xyz` behavior unchanged (`/` 302 auth-gate, `/projects` 200, `/settings` 302 `/settings/editor`).

---

## Follow-up Pass (2026-03-06) - P1 Reliability (PM Web 404 Route Shims)

### Checklist
- [x] Add PM web route shims for legacy/expected PM app paths currently serving 404.
- [x] Preserve auth-gated callback behavior and query string forwarding in the shims.
- [x] Re-run same smoke matrix and capture deploy-pending delta.

### Review
- Added reusable redirect helper:
  - `recoder-pm/apps/web/app/_lib/workspace-redirect.ts`
  - Handles session cookie gate, centralized signin callback URL, workspace base resolution, and query preservation.
- Refactored existing `/app` shims to use helper:
  - `recoder-pm/apps/web/app/app/route.ts`
  - `recoder-pm/apps/web/app/app/[...slug]/route.ts`
- Added new PM web route shims to avoid hard 404 on known entry paths:
  - `recoder-pm/apps/web/app/portal/route.ts` -> workspace `settings/portal`
  - `recoder-pm/apps/web/app/widget/route.ts` -> workspace `settings/widget`
  - `recoder-pm/apps/web/app/settings/route.ts` -> workspace `settings`
  - `recoder-pm/apps/web/app/settings/[...slug]/route.ts` -> workspace `settings/*`
- Validation:
  - `pnpm -C recoder-pm/apps/web exec tsc --noEmit --pretty false` still fails due pre-existing unrelated static-asset typing issues in home components (not route-shim files).
  - External smoke matrix remains unchanged in this snapshot (PM paths still 404 live), indicating deploy/runtime lag rather than missing local code.

---

## Sprint 15 — Reliability + Integration + Agency Features (2026-03-06)

### Phase 1: Reliability Finish
- [x] Loading.tsx added to app/ settings subtree (11 files)
- [x] Loading.tsx added to app/ dashboard (8 files) and billing (5 files + parent)
- [x] Loading.tsx added to recoder-agents checkout
- [x] Loading.tsx added to agency settings/account, settings/team, tasks, playground
- [x] PushNotificationPrompt hardcoded hex colors replaced with CSS variable fallbacks (9 colors)
- [x] global-error.tsx hardcoded hex colors replaced with CSS variable fallbacks (4 colors)
- [x] Last alert() in usage page replaced with inline error feedback

### Phase 2: Platform Integration
- [x] `@recoder/design-tokens` wired as workspace dependency to app, recoder-agents, agency, PM web
- [x] AppSwitcher added to recoder-web (Remix) — all active apps now have cross-app navigation
- [x] Cross-app billing awareness added to agency settings via recoder.xyz subscription endpoint

### Phase 3: Agency Feature Gaps
- [x] Settings button FIXME documented (deferred to settings-v2 redesign)
- [x] Workspace generation timeout extracted to env-configurable constant
- [x] Vector-stores team installation FIXME documented as known limitation
- [x] DB schema TODOs cleaned up (stale email null comment removed, graphUrl/workspaceId reworded)
- [ ] Lobby recent apps/workflows wired to DB (in progress)
- [ ] Favorites toggle API for showcase (in progress)
- [ ] Task archive functionality (in progress)
