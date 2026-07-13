# site — recoder.xyz marketing/product site

> Area: `site` · Path: `/Users/arhansubasi/recoder.xyz/site`
> Verified by reading source on 2026-07-01. Document only what is in the code.

## 1. Purpose

`site/` is the public **marketing + product website** for `recoder.xyz` — a small,
self-contained Next.js 15 (App Router) app that explains the Recoder product to
visitors, collects leads, and serves SEO/legal surfaces. It is the front door for
the platform, distinct from the application surfaces tracked elsewhere (`app/`,
`recoder-agents/`, etc.). Per `package.json`, its name is `@recoder/site` and its
own description is *"recoder.xyz — the OS for coding agents (marketing + product
site)"*.

It is deliberately thin: only `next`, `react`, `react-dom` as runtime deps, plus
Tailwind v4 (via `@tailwindcss/postcss`) for styling. There is **no backend
coupling** — the one stateful endpoint (`/api/leads`) writes a newline-delimited
JSON log to disk and optionally forwards to a webhook. The site degrades safely
when env vars are unset: no analytics, no download links, honest "notify me"
fallbacks. The context hint (runs non-root via systemd on the server) is
consistent with the code: it is a normal `next start` server (port 3010), and the
leads store falls back to the OS temp dir when its data dir is read-only.

## 2. Layout

Real top-level structure (excluding `node_modules`, `.next`, build artifacts):

| Path | What it holds |
|------|---------------|
| `app/` | Next.js App Router root: pages, route handlers, metadata routes, global CSS. |
| `app/page.tsx` | Home page (657 lines) — the main landing surface. |
| `app/how-it-works/`, `app/pricing/`, `app/enterprise/`, `app/self-host/`, `app/download/`, `app/changelog/` | Product/marketing pages (each a `page.tsx`). |
| `app/privacy/`, `app/terms/`, `app/legal/legal-page.tsx` | Legal pages; `legal-page.tsx` is a shared layout helper for legal copy. |
| `app/changelog/entries.ts` | **Single source of truth** for changelog entries (typed array), consumed by both the changelog page and the RSS feed. |
| `app/api/leads/` | Lead-capture API route (`route.ts`) + disk-backed store (`store.ts`). |
| `app/feed.xml/route.ts` | RSS 2.0 feed generated from `changelog/entries.ts`. |
| `app/sitemap.ts`, `app/robots.ts` | Next metadata routes for `sitemap.xml` / `robots.txt`. |
| `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `app/social-image.tsx` | Dynamically generated OG/Twitter/social images. |
| `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` | App-router icon conventions. |
| `app/globals.css` | Global Tailwind styles + the design tokens (`bg`, `fg`, `bg-soft`, `border-strong`, etc.) referenced in components. |
| `components/` | Shared UI: `site.tsx`, `lead-form.tsx`, `download-notify.tsx`, `analytics.tsx`. |
| `lib/releases.ts` | Env-driven download/release URL helpers (no hardcoded URLs). |
| `public/` | Static assets (logo.png, favicons). |
| `next.config.ts`, `postcss.config.mjs`, `tsconfig.json` | Build/tooling config. |
| `pnpm-lock.yaml` | **Own lockfile** — this app is not part of the root pnpm workspace (see Gotchas). |

`components/` summary:
- `site.tsx` (191 lines) — shared building blocks: `DownloadButton`, `SecondaryButton`, `Wordmark`, and `PUBLIC_GITHUB_URL` (only rendered when `NEXT_PUBLIC_GITHUB_URL` is set, because the repo is private).
- `lead-form.tsx` (152 lines) — the lead-capture form (posts to `/api/leads`).
- `download-notify.tsx` (116 lines) — "notify me when builds land" flow; used by `app/download/page.tsx` and `app/enterprise/page.tsx`.
- `analytics.tsx` (38 lines) — Plausible loader, gated behind `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.

## 3. Entry points

Start reading in this order:

- `app/layout.tsx` — root layout: site `Metadata`, JSON-LD (`Organization`, not a fake `SoftwareApplication` offer — see comment at `app/layout.tsx:45`), Inter font wiring, and `<Analytics />` mount.
- `app/page.tsx` — the home page; the largest single surface.
- `components/site.tsx:11` — `DownloadButton`, the single primary CTA used across pages; `components/site.tsx:9` exports `PUBLIC_GITHUB_URL`.
- `app/api/leads/route.ts:20` — `POST` handler for lead capture; runtime pinned to `nodejs` (`route.ts:5`) because it writes to disk. Validates `kind` ∈ {notify, sales} and `platform` ∈ {macos, windows, linux, any}.
- `app/api/leads/store.ts:45` — `saveLead()`, the persistence contract.
- `lib/releases.ts` — download href resolution; `downloadHref()` (`lib/releases.ts:56`) and `releasesArePublic()` (`lib/releases.ts:70`) drive whether the Download page serves real builds or the notify fallback.
- `app/changelog/entries.ts:21` — `CHANGELOG` array; the canonical changelog data.
- `app/feed.xml/route.ts:38` — `GET` that renders the RSS feed from that array.

## 4. Build / run / test

From `site/package.json` `scripts` (run with pnpm/npm from inside `site/`):

| Script | Command | Notes |
|--------|---------|-------|
| `dev` | `next dev --port 3010` | Local dev server on **port 3010**. |
| `build` | `next build` | Production build. ESLint is ignored during build (`next.config.ts:14`). |
| `start` | `next start --port 3010` | Production server on port 3010 (matches the systemd-managed deploy). |
| `lint` | `next lint` | ESLint via Next. |
| `typecheck` | `tsc --noEmit` | TypeScript check. |

There are **no test scripts** in `package.json` — there is no unit/E2E test
harness in this directory. Verification of changes is via `typecheck` / `lint` /
`build` plus manual/browser checks.

`pnpm.onlyBuiltDependencies` is `["sharp", "@tailwindcss/oxide"]` (native build
deps for image optimization and Tailwind's oxide engine).

## 5. Key patterns & contracts

- **Path alias**: `@/*` → `./*` (`tsconfig.json:17`). TS is `strict`, `noEmit`, `moduleResolution: bundler`, target ES2022.
- **Degrade-safe env gating** is the dominant convention. Nothing is hardcoded that could 404 or fake success:
  - Analytics renders **nothing** unless `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set (`components/analytics.tsx:26`). `NEXT_PUBLIC_PLAUSIBLE_SRC` overrides the script source for self-hosted Plausible.
  - Download links come only from env: `NEXT_PUBLIC_GITHUB_RELEASES_URL` and per-platform `NEXT_PUBLIC_DOWNLOAD_{MACOS,WINDOWS,LINUX}_URL` (`lib/releases.ts`). `httpUrl()` rejects any non-`http(s)` value so a misconfig never renders. `NEXT_PUBLIC_RELEASE_VERSION` is a display-only label.
  - `PUBLIC_GITHUB_URL` is only rendered when `NEXT_PUBLIC_GITHUB_URL` is set (repo is private).
- **Leads contract** (`app/api/leads/store.ts`):
  - `Lead` is a readonly interface with `kind` ∈ {`notify`, `sales`}, validated `email`, optional `platform`/`plan`/`message`/`source`, generated `id` + ISO `createdAt`.
  - Persisted as NDJSON to `LEADS_DATA_DIR` → else `<cwd>/.data/leads.ndjson` → else `<os.tmpdir>/recoder-leads/leads.ndjson`. Write failure **propagates** (no silent swallow).
  - Optional best-effort POST to `LEADS_WEBHOOK_URL` after the durable write.
  - API responses use a `{ success, ... }` envelope: `201 {success:true,id}`, `400` on bad input, `503` on persist failure with an honest message pointing at `founders@recoder.xyz` (`app/api/leads/route.ts:64-76`).
  - Input is clamped: `plan`≤64, `message`≤2000, `source`≤128 chars; email ≤254 chars and regex-validated (`store.ts:18`).
- **Changelog is one typed source**: `app/changelog/entries.ts` `CHANGELOG` feeds both the page and `feed.xml`. RSS XML-escapes all copy (`feed.xml/route.ts:9`) and uses RFC-822 pubDates; feed is cached `max-age=3600`.
- **Security headers** are set globally in `next.config.ts:16` for `/(.*)`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `poweredByHeader` is disabled.
- **SEO surfaces**: `sitemap.ts` (9 routes, home priority 1.0), `robots.ts` (allow-all + sitemap), dynamic OG/Twitter/social images, and `metadataBase`/canonical set in `layout.tsx`.
- **CTA discipline**: a single primary `DownloadButton` everywhere; `SecondaryButton` for secondary actions, auto-detecting external `http` hrefs and adding `target="_blank" rel="noreferrer"`.

## 6. Gotchas

- **Not in the pnpm workspace.** `pnpm-workspace.yaml` at the repo root does **not**
  list `site/` (members are `docker-backend`, `apps/*`, `shared`, `packages/*`,
  `scripts`, `ts/extracted-from-openclaw`). `site/` ships its **own
  `pnpm-lock.yaml`** and is installed/built independently. Do not assume root
  `pnpm install` / root catalog versions cover it — run pnpm inside `site/`.
- **`SITE_ASSET_PREFIX` reverse-proxy hazard.** `next.config.ts:8` reads
  `SITE_ASSET_PREFIX` (e.g. `/__site`) so this site's `/_next/*` assets don't
  collide with the main app's `/_next/*` when both are served on `recoder.xyz`.
  If you change asset serving, account for this; the release URLs in `lib/releases.ts`
  are deliberately absolute external URLs and intentionally bypass the prefix.
- **Build artifacts present on disk.** `.next/`, `node_modules/`,
  `tsconfig.tsbuildinfo` (270 KB) exist in the working tree but are gitignored
  (`site/.gitignore`). Ignore them for source reading; edit `app/`/`components/`/`lib/`.
- **`.data/` lead log is gitignored** (`.gitignore` includes `.data`). On a
  read-only deployment FS the store silently falls back to the OS temp dir, so
  captured leads may live in `<os.tmpdir>/recoder-leads/` rather than the project
  dir — check `LEADS_DATA_DIR` in prod to know where they land.
- **ESLint is skipped during `next build`** (`next.config.ts:14`). `next build`
  passing does NOT mean lint is clean — run `pnpm lint` / `pnpm typecheck`
  separately.
- **No tests.** There is no test runner here; do not look for `*.test.ts`. Verify
  changes via typecheck/lint/build and browser checks.
- **`@recoder/site` name vs non-membership.** The `@recoder/` scope makes it look
  like a workspace package, but it is standalone (see first bullet). Don't add it
  to other packages' dependencies expecting workspace resolution.
