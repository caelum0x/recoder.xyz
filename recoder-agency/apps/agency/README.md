# Recoder Agency

https://recoder.xyz

## Getting Started

> [!WARNING]
> It is difficult to start because there are many environment variables that need to be set.

## Required environment variables (API Publishing)

- **`GISELLE_API_SECRET_SCRYPT_N`**: scrypt N parameter (default: `16384`)
- **`GISELLE_API_SECRET_SCRYPT_R`**: scrypt r parameter (default: `8`)
- **`GISELLE_API_SECRET_SCRYPT_P`**: scrypt p parameter (default: `1`)
- **`GISELLE_API_SECRET_SCRYPT_KEY_LEN`**: derived key length (default: `32`)
- **`GISELLE_API_SECRET_SCRYPT_SALT_BYTES`**: salt size in bytes (default: `16`)
- **`GISELLE_API_SECRET_SCRYPT_LOG_DURATION`**: set to `1` to log scrypt duration to server logs (default: disabled)
- **`FEATURE_RETRY_PANEL`**: enable/disable admin retry transition panel (default: `true`)
- **`NEXT_PUBLIC_FEATURE_RETRY_PANEL`**: client-visible mirror for retry panel flag where needed
- **`NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS`**: enable client review funnel PostHog events
- **`FEATURE_AUTO_REFRESH_WEEKLY_METRICS`**: refresh weekly KPI materialized view on status transitions (off by default)
- **`FEATURE_MANUAL_REFRESH_WEEKLY_METRICS`**: enable manual "Refresh KPIs" action on admin dashboard
- **`WEEKLY_METRICS_STALE_AFTER_DAYS`**: stale threshold (days) used by dashboard freshness badge
- **`AGENCY_STAGING_DATABASE_URL`**: staging DB URL used by delivery runbooks/CI checks

## Delivery operations docs

- `docs/runbooks/agency-delivery-staging.md`
- `docs/runbooks/agency-delivery-rollout-checklist.md`
- `docs/runbooks/agency-delivery-rollback-snippets.sql`

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
