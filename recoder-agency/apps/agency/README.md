# Recoder Agency

https://recoder.xyz

## Getting Started

> [!WARNING]
> It is difficult to start because there are many environment variables that need to be set.

## Required environment variables

Core runtime:
- **`DATABASE_URL`**: PostgreSQL connection string
- **`BETTER_AUTH_SECRET`**: auth secret (32+ chars)
- **`BETTER_AUTH_URL`**: app origin (for local: `http://localhost:3000`)

OAuth (canonical names used by app):
- **`GOOGLE_OAUTH_CLIENT_ID`**
- **`GOOGLE_OAUTH_CLIENT_SECRET`**
- **`GITHUB_APP_CLIENT_ID`**
- **`GITHUB_APP_CLIENT_SECRET`**

Delivery ops / release gates:
- **`AGENCY_STAGING_DATABASE_URL`**: staging DB URL used by runbooks and CI checks
- **`WEEKLY_METRICS_STALE_AFTER_DAYS`**: freshness threshold used by readiness checks
- **`RESTORE_DRILL_STALE_AFTER_DAYS`**: restore-drill freshness threshold
- **`CRON_RATE_LIMIT_MAX_REQUESTS`**: max requests per cron route key within a window
- **`CRON_RATE_LIMIT_WINDOW_MS`**: cron rate-limit window size in milliseconds

Feature flags:
- **`FEATURE_RETRY_PANEL`** / **`NEXT_PUBLIC_FEATURE_RETRY_PANEL`**
- **`FEATURE_AUTO_REFRESH_WEEKLY_METRICS`**
- **`FEATURE_MANUAL_REFRESH_WEEKLY_METRICS`**
- **`NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS`**

Optional analytics (only if funnel analytics enabled):
- **`NEXT_PUBLIC_ENABLE_POSTHOG`**
- **`NEXT_PUBLIC_POSTHOG_KEY`**
- **`NEXT_PUBLIC_POSTHOG_HOST`**

Notes:
- Use canonical OAuth names above; avoid alias vars like `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- Keep `AGENCY_STAGING_DATABASE_URL` on a single line with no newline wrap.

## Delivery operations docs

- `docs/runbooks/agency-delivery-staging.md`
- `docs/runbooks/agency-delivery-rollout-checklist.md`
- `docs/runbooks/agency-delivery-rollback-snippets.sql`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/production-troubleshooting.md`
- `docs/runbooks/monitoring-and-alerts.md`
- `docs/runbooks/disaster-recovery.md`
- `docs/runbooks/release-promotion.md`

## Delivery ops commands

- `pnpm ops:staging:delivery-check`
- `pnpm ops:staging:refresh-weekly-metrics`
- `pnpm ops:staging:check-weekly-metrics-freshness`
- `pnpm ops:staging:seed-weekly-metrics-fixture`
- `pnpm ops:staging:assert-weekly-metrics-fixture`
- `pnpm ops:staging:cleanup-weekly-metrics-fixture`
- `pnpm ops:staging:verify-weekly-metrics-pipeline`
- `pnpm ops:staging:test-transition-guardrails`

1. Set up your `.env` file
    1. Duplicate `.env.example` to `.env`.
    2. Please set the environment variables in the `.env` file.
2. Install dependencies

    ```sh
    pnpm install
    ```

3. Start developing and watch for code changes

    ```sh
    pnpm turbo dev
    ```
