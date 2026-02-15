# Recoder PM

**AI-powered product management — "Cursor for Product Managers"**

Part of the [recoder.xyz](https://recoder.xyz) product family.

Execution tracking note:
- Canonical cross-repo production tracker is `/Users/arhansubasi/recoder.xyz/plan.md`.
- This README remains PM-specific setup/runbook reference.



## Plan

Fork [Eververse](https://github.com/haydenbleasel/eververse) or https://github.com/giselles-ai/giselle.git (MIT license, 344 stars)
- Next.js 16, React 19, Prisma 7, Supabase Auth, Vercel AI SDK
- Complete PM SaaS: feedback, roadmaps, RICE scoring, integrations (Jira, Linear, GitHub, Slack)
- AI: sentiment analysis, feedback summarization, writing assistant

  Running & Healthy

  All 7 containers are up with clean logs. No crashes.

  Still TODO

  1. Empty env vars in .env.docker (need your values)

  Required for the app to fully work:
  ┌──────────────────────────────────┬──────────────────┬───────────────────────────────────────────────────────────┐
  │             Variable             │    Needed by     │                          Purpose                          │
  ├──────────────────────────────────┼──────────────────┼───────────────────────────────────────────────────────────┤
  │ BETTER_AUTH_SECRET               │ app, portal, api │ Auth session signing — generate with openssl rand -hex 32 │
  ├──────────────────────────────────┼──────────────────┼───────────────────────────────────────────────────────────┤
  │ AUTH_DATABASE_URL                │ app, portal, api │ Shared auth DB (recoder.xyz app Postgres)                 │
  ├──────────────────────────────────┼──────────────────┼───────────────────────────────────────────────────────────┤
  │ RECODER_PM_ADMIN_ORGANIZATION_ID │ all              │ Your org ID after first signup                            │
  ├──────────────────────────────────┼──────────────────┼───────────────────────────────────────────────────────────┤
  │ RECODER_PM_ADMIN_WIDGET_ID       │ web              │ Portal widget embed ID                                    │
  └──────────────────────────────────┴──────────────────┴───────────────────────────────────────────────────────────┘
  Required for payments:
  ┌──────────────────────────────┬───────────────┬──────────────────────────────┐
  │           Variable           │   Needed by   │           Purpose            │
  ├──────────────────────────────┼───────────────┼──────────────────────────────┤
  │ POLAR_ACCESS_TOKEN           │ app, web, api │ Polar.sh API access token    │
  ├──────────────────────────────┼───────────────┼──────────────────────────────┤
  │ POLAR_WEBHOOK_SECRET         │ api           │ Polar webhook verification   │
  ├──────────────────────────────┼───────────────┼──────────────────────────────┤
  │ POLAR_PRODUCT_PRO_ID         │ app, web, api │ Polar product ID (Pro)       │
  ├──────────────────────────────┼───────────────┼──────────────────────────────┤
  │ POLAR_PRODUCT_ENTERPRISE_ID  │ app, web, api │ Polar product ID (Enterprise)│
  ├──────────────────────────────┼───────────────┼──────────────────────────────┤
  │ POLAR_SERVER                 │ app, web, api │ "sandbox" or "production"    │
  └──────────────────────────────┴───────────────┴──────────────────────────────┘
  Required for email:
  ┌────────────────┬───────────┬──────────────────────┐
  │    Variable    │ Needed by │       Purpose        │
  ├────────────────┼───────────┼──────────────────────┤
  │ RESEND_API_KEY │ app, api  │ Transactional emails │
  └────────────────┴───────────┴──────────────────────┘
  Optional (AI features):
  ┌──────────────────────────────┬───────────────────────┐
  │           Variable           │        Purpose        │
  ├──────────────────────────────┼───────────────────────┤
  │ OPENAI_API_KEY               │ OpenAI provider       │
  ├──────────────────────────────┼───────────────────────┤
  │ OPENROUTER_API_KEY           │ OpenRouter provider   │
  ├──────────────────────────────┼───────────────────────┤
  │ ANTHROPIC_API_KEY            │ Anthropic provider    │
  ├──────────────────────────────┼───────────────────────┤
  │ AI_KEY_ENCRYPTION_SECRET     │ Encrypt user API keys │
  ├──────────────────────────────┼───────────────────────┤
  │ NEXT_PUBLIC_LOGO_DEV_API_KEY │ Company logo lookups  │
  └──────────────────────────────┴───────────────────────┘
  2. Agency service (not built)

  The recoder-agency Dockerfile exists but hasn't been built/started yet. Nginx is configured to handle it lazily so it won't block anything.

  3. Minor warnings (non-blocking)

  - metadataBase not set on web/portal — cosmetic, only affects OG image URLs in dev
  - MINIO_ROOT_PASSWORD is still change-me-in-production

  4. Cloudflare DNS

  Once you're ready to go live, you'll need a pm.recoder.xyz DNS record pointing to the server, plus storage.pm.recoder.xyz for file CDN.

  5. Database migrations

  If you pull recent changes, run:
  - `pnpm -C recoder-pm migrate`
  - Ensure Postgres has `extensions` schema + `uuid-ossp` if using Neon.

## Shared Auth Runbook (recoder.xyz + pm.recoder.xyz + agency.recoder.xyz)

Goal: single sign-in across subdomains using the app DB for auth tables and cross-subdomain cookies.

### 1) Environment variables (all three apps)
- Set the same `BETTER_AUTH_SECRET` value everywhere.
- Set `AUTH_DATABASE_URL` in recoder-pm + recoder-agency to the **app** Postgres URL.
- Ensure `BETTER_AUTH_URL` points to each app’s base URL:
  - recoder.xyz (app)
  - pm.recoder.xyz (recoder-pm)
  - agency.recoder.xyz (recoder-agency)

### 2) Ensure auth tables exist in the app DB
The app DB must have `user`, `session`, `account`, `verification` tables.
If missing, run the app’s Prisma migrate/push that creates Better Auth tables.

### 3) Run recoder-pm migrations
This only creates PM domain tables + the local profile table (`auth_user`).
- `pnpm -C recoder-pm migrate`

### 4) Cross-subdomain cookies (must be enabled)
Already configured in code, but verify in prod:
- Cookie name is `recoder.session_token` (and `__Secure-` variant in prod).
- Cookie domain is `.recoder.xyz`.
- SameSite is `none` in production.

### 5) End-to-end verification (manual)
1. Sign in at `https://recoder.xyz`.
2. Open `https://pm.recoder.xyz` in the same browser.
3. Open `https://agency.recoder.xyz` in the same browser.
Expected: no login prompt; user is authenticated.

### Troubleshooting
- If pm/agency see a login prompt:
  - Confirm `AUTH_DATABASE_URL` points to the app DB.
  - Confirm `BETTER_AUTH_SECRET` matches across all apps.
  - Check cookie domain is `.recoder.xyz` and SameSite is `none` in prod.
  - Inspect cookie value: session token may be of form `token.signature` — backend splits at `.` to find the DB token.

## Feature Phases (all complete)

### Phase 3.3: Analytics Connectors UX Polish — Done
- Provider forms with inline help text, docs links, per-provider field hints
- Connection readiness badges ("Ready to sync" / "Needs setup")
- Sync actions: primary Sync Now button, last sync timestamp, last 5 sync logs
- Status badges (ACTIVE, PAUSED, ERROR, Not connected), disabled states

### Phase 3.5: Data Ingestion Health Dashboard — Done
- Data Health section on Insights overview (`insights/components/data-health/index.tsx`)
- Full Data Health page at `/insights/data-health` with connector status + freshness
- Links to configuration pages for analytics, session recordings, support (Zendesk)

### Phase 3.6: Data Quality + Alerting — Done
- Staleness badges (7+ days) with "Fresh"/"Stale"/"No data" for all 3 sources
- Manual "Run sync now" via `SyncActions` component
- Error alert banner when any connector is in ERROR state

### Phase 3.7: Automated Alert Notifications — Done
- Daily cron at 9am UTC (`data-health` job in scheduler)
- `runDataHealthAlerts()` emails ADMIN/EDITOR users with issue list
- Optional Slack webhook delivery via `SlackInstallation.dataHealthAlertsEnabled`

### Phase 4.4: Custom AI Prompts Per Organization — Done
- `Organization.aiPrompt` field in schema
- Settings UI: `AiPromptForm` on AI settings page (admin only, 2000 char recommendation)
- Injected into all AI pipelines via `withOrganizationSystemPrompt()` / `withOrganizationUserPrompt()`
- Applied to: insights synthesis, contradiction detection, opportunity scoring, writing assistant

  ---
  The most critical next step is generating BETTER_AUTH_SECRET — without it, login won't work
