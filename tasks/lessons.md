# Lessons

## 2026-03-05
- Do not remove large sections from `plan.md` during cleanup. Preserve historical/architectural context and only update checkboxes/status lines explicitly requested. 
- Before replacing legacy paths, verify whether they are active runtime contracts. `apps/ui.giselles.ai` exists and must remain as a valid default unless fully migrated.
- For CDN-fronted debugging, validate both origin and edge. Cloudflare can serve stale cached responses that hide successful origin fixes.

## 2026-03-06
- When the user says "continue on this", default to implementation work from `plan.md` rather than discussion-only updates.
- Before committing in a large dirty worktree, check staged files for secrets/artifacts (`.env`, `__pycache__`, `*.pyc`) and unstage them first.
- When CSP issues appear fixed in app config but still fail in production, audit nginx/global proxy headers first; proxy-level CSP can override app-level directives.
- In this repo, `users` is the canonical app identity table; any `prisma.user` usage must be explicit compatibility fallback, not the primary path.
- Be careful with broad `.gitignore` unignore patterns; use exact-file unignore rules to avoid accidentally surfacing unrelated untracked files.
- For auth smoke tests, validate against the same API contract the UI uses (`/api/auth/register` + verify endpoints), not alternative auth endpoints.
- Always inspect authenticated API response payloads for secret leakage during verification; status-code checks alone can miss critical issues.
- Audit scopes must include both `app/app/api` and legacy `app/api` trees; fixes limited to one tree can leave real runtime `prisma.user` paths behind.
- On this host, active CSP policy is enforced from `/etc/nginx/nginx.conf`; updating repo-side nginx files alone does not change live headers.
- For legacy production databases, use `prisma migrate resolve --applied` baseline after schema verification instead of forcing `migrate deploy` when `P3005` appears.
- Treat placeholder secrets (`your-*`, inline comment examples) as unconfigured in health and credential resolution; otherwise runtime appears healthy while payment/email integrations fail at execution time.
- During infra outages, auth routes should return explicit degraded `503`/safe contracts rather than opaque `500`; this keeps client behavior predictable and avoids misleading verifier noise.
- Health payload error text should be sanitized before JSON serialization because upstream driver messages may include control characters that break strict JSON parsers.
- Verification scripts must treat transport and parse failures as counted test failures, not hard exits, so automation always returns a complete PASS/FAIL summary.
- For shell templating paths that feed `awk`/`envsubst`, explicitly `export` defaulted variables; otherwise empty compose env values can still render blank runtime config fields.
- For restore drills on this host, check disk headroom before spinning temporary DB containers; with root at 100% usage, restore verification will fail even if backups are valid.
- For SQL dump restore validation, use a temporary PostgreSQL image matching or newer than dump source major version; older versions can fail on newer config parameters (e.g., `transaction_timeout`).
- For multi-app metadata, avoid generic `NEXT_PUBLIC_SITE_URL` domain bleed; enforce per-surface canonical fallback domains and verify rendered `og:url`/canonical tags on live pages.
- In multi-surface auth setups, `AUTH_DATABASE_URL` drift can break one surface while others stay healthy; validate both `DATABASE_URL` and `AUTH_DATABASE_URL` per app runtime, not just global env files.
- For runtime closeout tasks that require host deploy/restart, confirm SSH access up front; without host credentials, keep status as code-complete but runtime-unverified.
- Shared workflow catalogs exist in multiple services (`app`, `docker-backend`, `recoder-web`); path/domain migration fixes must be applied in all copies plus parity tests.
- Branding grep results include many internal engine symbols (`giselle`, `is_suna_default`); close user-facing tasks using active runtime refs/endpoints, not internal implementation tokens.
- For cross-app navigation settings, define switcher URLs once in `@recoder/ecosystem-config` and import them downstream; avoid duplicating prod URLs in per-app config files.
- When touching legacy studio surfaces, keep ecosystem links sourced from shared URL constants even if studio is lower-priority; this prevents stale subdomain drift.
- A shared UI component is not always the right abstraction: when package boundaries (`@recoder/shared` commonjs/non-React) conflict, centralize shared data contract and keep thin per-app view wrappers.
- In zsh, avoid loop variable name `path`; it mutates the special shell `path` array and can break command resolution (`command not found` cascade).
- For email/reset E2E in production-like environments with send-only mail keys, prefer deterministic admin-seeded verification artifacts plus public endpoint validation instead of mailbox scraping.
- For PM2-managed Next apps, `.env` edits alone are not enough when process env was set at start; verify with `pm2 env <id>` and restart with explicit `VAR=... pm2 restart --update-env`.
- Migration filename order can be non-canonical in legacy trees; apply using dependency order (e.g., `0080` before `0078/0079`) instead of strict lexicographic order when tables are introduced later.
- When validating split auth/app DB wiring, enforce runtime guards against local DB drift: reject non-Postgres schemes and localhost DB URLs in production for both `DATABASE_URL` and `AUTH_DATABASE_URL`.
- For debug-log cleanup tasks, audit both `app/app/api` and legacy `app/api`; route-handler logs can remain in the legacy tree even when the app-router tree is clean.
- For large TypeScript debug-log sweeps, use AST-based removal (expression-statement `console.log/debug`) instead of regex to avoid breaking multiline calls and JSX syntax.
- In PM apps, design-system typography is controlled via CSS vars (`--font-geist-sans/mono`); remapping those vars in app layouts is the safest way to roll out a new global font without package-wide refactors.
- In cross-subdomain auth flows, treat `/auth/signin` as the canonical entrypoint and periodically grep runtime error/recovery helpers for stale `/login` redirects to avoid dead-end recovery UX.
- For protected nav-entry pages, always preserve full `pathname + search` in `redirect` params (middleware and client guards); dropping query state causes avoidable dead-end returns after sign-in.
- Loading routes should never return blank placeholders (`<div />`) in production surfaces; use skeletons/spinners so users don’t perceive frozen or broken screens during route transitions.
- Before shipping onboarding CTAs, cross-check every linked app path against actual route files (especially between product features and `/settings/*` surfaces) to avoid silent dead links like `/portal` vs `/settings/portal`.
- On auth-gated PM surfaces, error/global-error recovery CTA should target `/app` (or another protected app entry) rather than `/` to keep users in the intended workspace auth/callback path.
- When one PM surface is marketing-only and workspace routes are served elsewhere, add lightweight route shims on the marketing app for common deep links (`/portal`, `/widget`, `/settings/*`) so users enter the auth/callback flow instead of hitting raw 404s.

## 2026-03-07
- When Docker builds fail with no visible error (just route listing then exit code 1), pipe full output to a file and filter out noise (sourcemap warnings, route listings, empty chunks) to find the real Rollup/Vite error buried in the output.
- Docker `env_file` values are baked at container creation time; `docker restart` does NOT re-read the env_file. Must `docker stop && docker rm && docker compose up -d` to pick up .env changes.
- When renaming packages (e.g. `@giselles-ai/*` → `@recoder/*`), grep the production server for stale imports — local repo may be fixed but server copy can lag behind, causing Docker builds to fail only on the server.
- `INTERNAL_SERVICE_KEY` is a hard requirement for recoder-web production startup (`process.exit(1)` if missing); must be at least 32 chars and not a placeholder pattern.
- Docker `--no-cache` is required when source files were updated on the host but Docker cached the COPY layer from a previous build.
- In PM's Prisma setup, JSON fields (`raw`, `properties`) typed as `Record<string, unknown>` are not assignable to `InputJsonValue`; cast via `as Prisma.InputJsonValue | undefined`.
- Prisma `createMany`/`create` data objects can't use raw `null` for JSON columns; use `Prisma.DbNull` instead.
- When catch blocks give `unknown` typed errors, pino's `log.error` expects `Record<string, any>`; cast with `error as Record<string, unknown>`.
- Making env vars optional in `@t3-oss/env-nextjs` schemas changes the return type to `string | undefined`, which cascades to all usage sites; guard with null checks at call sites.
- Next.js static page generation executes API route handlers during build; if routes access the database, the build needs a live database connection or routes must export `dynamic = "force-dynamic"`.
- PostHog server SDK (`posthog-node`) throws on `new PostHog("")`; guard instantiation with a key check before constructing.
- `.env.local` in a Turborepo monorepo must be in the app directory (e.g., `apps/app/.env.local`), not just the monorepo root; Next.js reads env relative to its own working directory.
