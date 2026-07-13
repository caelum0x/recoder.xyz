# app — recoder.xyz main Next.js app

> Area: `app`. Documented from the **git-tracked files only** (11 files). See the
> "Gotchas" section first — most of this directory is intentionally absent from
> the checkout, so this doc is necessarily partial and says so where it is.

## 1. Purpose

`app/` is the Next.js application that serves **`https://recoder.xyz`** — the
identity and control-plane surface of the Recoder platform. Per `AGENTS.md`,
`recoder.xyz` is the auth source of truth, so this app owns sign-in/SSO, the
cross-subdomain session "bridge" to other surfaces (`web.recoder.xyz`,
`studio.recoder.xyz`, CLI, extension), BYOK (bring-your-own-key) gating, and the
project-snapshot persistence that backs the user's saved projects.

It is a standard Next.js App Router app (`app/` route directory, `[locale]`
segment, `app/api/*` route handlers) backed by Prisma over the self-hosted
PostgreSQL (`DATABASE_URL`). It ships as a Docker image (`Dockerfile`,
multi-stage, Next.js **standalone** output, runs `node server.js` on port 3000).

⚠️ The verbatim source of most of this app is **not present in this git
checkout** (broad secret-filename `.gitignore` rules hide it). What is tracked is
a deliberately re-included slice: the project-snapshot persistence layer, three
API routes, one component, the sign-in page, and the Prisma schema. Treat
everything outside that slice as "exists in the prod/Docker build context but not
readable here."

## 2. Layout (real, on-disk + tracked)

Only these paths exist in the checkout (everything else under `app/` is absent):

| Path | What it holds |
|------|----------------|
| `app/Dockerfile` | Multi-stage build (pnpm + Prisma generate + Next standalone). Authoritative build recipe. |
| `app/prisma/schema.prisma` | Prisma schema, ~2900 lines, **126 models** (`account`/`accounts`, `users`, `projects`, `chat_sessions`, `chat_messages`, `agents`, …). `provider = postgresql`, `url = env("DATABASE_URL")`. |
| `app/lib/snapshot-paths.ts` | Pure, dependency-free file/dir bookkeeping helpers for project snapshots (`coerceFiles`, `coerceDirectories`, `ancestorDirectories`, `renamePath`, `mergeSnapshotState`). No DB/IO imports. |
| `app/lib/snapshot-paths.test.ts` | `node:test` unit tests for the pure helpers. Imports `./snapshot-paths.ts` directly. |
| `app/lib/project-snapshots.ts` | DB-bound snapshot repository over Prisma (`@/lib/prisma`). Owns the `project_snapshots` table + chat-count/transcript hydration. |
| `app/app/api/projects/route.ts` | `GET /api/projects` — list a user's project snapshots. |
| `app/app/api/projects/[projectId]/route.ts` | `GET` + `PATCH /api/projects/:projectId` — fetch one snapshot (with transcript) / apply a snapshot delta. |
| `app/app/api/project/verify-ownership/route.ts` | `POST /api/project/verify-ownership` — internal-service ownership check. |
| `app/app/api/platform/access/route.ts` | `POST`/`GET /api/platform/access` — cross-subdomain session bridge to web/studio/cli/extension. |
| `app/app/components/LaunchWebIDEButton.tsx` | Client component: BYOK-gated "Launch Web IDE" handoff. |
| `app/app/[locale]/auth/signin/page.tsx` | Unified sign-in page (email + GitHub/Google OAuth + 2FA). |

The Next.js route directory is `app/app/` (the app lives one level down, so route
handlers are at `app/app/api/...`). Locale-scoped pages are under
`app/app/[locale]/`.

## 3. Entry points

Read in this order:

1. **`app/Dockerfile`** — the only complete, authoritative description of how the
   app is assembled and run. Build: `pnpm install --filter ./app...`,
   `prisma generate`, `pnpm run build`. Runtime: `CMD ["node", "server.js"]` on
   `PORT=3000`, healthcheck hits `/api/health`.
2. **`app/prisma/schema.prisma`** — the data model. Note `account` vs `accounts`
   and the single `users` model (`schema.prisma:2475`); `projects:1396`,
   `chat_sessions:2793`, `chat_messages:2819`.
3. **`app/lib/project-snapshots.ts`** — the persistence contract every snapshot
   route depends on. The `ensureProjectSnapshotsTable()` raw-SQL bootstrap is at
   `project-snapshots.ts:36`.
4. **Route handlers** — `app/app/api/projects/route.ts:6` (GET),
   `app/app/api/projects/[projectId]/route.ts:44` (GET) / `:102` (PATCH),
   `app/app/api/platform/access/route.ts:58` (POST bridge).

There is **no tracked `package.json`, `next.config.*`, or `tsconfig.*`** in this
checkout, so the script names and Next config can't be cited from source here
(see Gotchas).

## 4. Build / run / test

The real build/run commands come from the **Dockerfile** (the workspace
`package.json` for `app` is not tracked):

```bash
# Build (from repo root, as the Dockerfile does)
pnpm install --filter ./app... --no-frozen-lockfile
cd app && pnpm exec prisma generate            # generates app Prisma client
cd app && pnpm run build                        # Next.js build → .next/standalone
node app/.next/standalone/server.js             # runtime entry (PORT=3000)

# Or just build the image:
docker build -f app/Dockerfile -t recoder-app .
```

- The Dockerfile's `pnpm run build` proves a `build` script exists in the
  (untracked) `app/package.json`, but the script body is not visible here.
- **Tests:** the only tracked test is `app/lib/snapshot-paths.test.ts`, written
  for the Node built-in test runner (`import { test } from 'node:test'`). Run the
  pure-helper tests with `node --test` (it imports `./snapshot-paths.ts`
  directly). The `.gitignore` also references untracked tests
  (`app/__tests__/api/*`, `app/lib/__tests__/*`) that are not in this checkout.
- Build-time env: `SKIP_ENV_VALIDATION=true` plus dummy secrets and
  `DATABASE_URL=postgresql://build:build@localhost:5432/build` are injected so
  Next's page-data collection phase doesn't need real infra.
- `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_RECODER_WEB_URL` are build ARGs inlined at
  build time (default to `https://recoder.xyz` / `https://web.recoder.xyz`).

## 5. Key patterns & contracts

**Auth resolution (two paths).** Snapshot routes accept either a browser session
OR an internal-service call:
- Internal: presence of `x-internal-service-key` / `x-internal-signature` /
  `x-internal-timestamp` / `x-internal-nonce` headers triggers
  `verifyInternalServiceRequest(request, { rawBody })`; the effective user comes
  from the `x-user-id` header. (`projects/route.ts:8`,
  `projects/[projectId]/route.ts:9`.)
- Browser: `requireAuth(request)` / `auth.api.getSession(...)`, then
  `ensureAppUserFromAuthUser(authUser)`.
- For `verify-ownership`, the raw request body is read first and passed to
  `verifyInternalServiceRequest({ rawBody })` so the signature covers the body.

**Unified-`users` cross-model fallback (load-bearing).** A snapshot may be stored
under either the Better Auth session id or the resolved app-`users` id for the
same human (same email, different id). `resolveSnapshotOwnerCandidates()`
(`project-snapshots.ts:113`) builds an ordered, de-duplicated candidate list
(primary → explicit fallbacks → email-counterpart ids from the `users` table) and
the `*WithLegacyFallback` helpers walk it primary-first. Routes pass the
already-resolved `fallbackUserId` so the extra `users` lookup is skipped when
possible. This is the practical reflection of the "keep `user` and `users`
separate" architecture rule.

**Snapshot persistence is raw-SQL, not a Prisma model.** `project_snapshots` is
created on demand via `prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS …')`
gated by a module-level `schemaEnsured` flag (`project-snapshots.ts:34`). Reads
and the upsert use `$queryRawUnsafe` with positional `$1..$N` params (parameter
ized — no string interpolation of user input). Versioning: `version` increments
on conflict; `COALESCE(EXCLUDED.x, existing.x)` preserves prior values.

**Pure merge core.** All file/dir mutation logic lives in the IO-free
`snapshot-paths.ts` (`mergeSnapshotState`, ordered 6-step merge:
upsert→removePaths→removePrefixes→rename→addDirs→removeDirs). The DB module just
composes it. Untrusted JSONB is coerced (`coerceFiles` drops non-string values;
`coerceDirectories` sorts+dedups). This is the layer the unit test covers.

**API response envelope.** Routes return `{ success, data, total?, error? }` (or
`{ isOwner }` for verify-ownership). Note the projects-list `GET` deliberately
**fails open**: on error it returns `200 { success: true, data: [], warning }`
rather than a 5xx (`projects/route.ts:101`).

**Chat-count hydration is best-effort and N+1-free.** `getProjectMessageCounts`
does two indexed Prisma queries (`chat_sessions.findMany` then
`chat_messages.groupBy` by `sessionId`) regardless of project count, matching a
session by EITHER `projectId` or `urlId`, and swallows errors into an empty map.
`chat_sessions.totalMessages` is treated as a cache that can drift — live
`chat_messages` count is authoritative.

**Cross-subdomain SSO bridge.** `POST /api/platform/access` extracts a session
token from a list of candidate cookie names (`__Secure-recoder.session_token`,
`recoder.session_token`, …), validates via `auth.api.getSession` with a DB
`findFallbackSessionByToken` fallback, and returns a `bridgeUrl`
(`https://web.recoder.xyz/auth/verify?token=…&redirect=…`) for `platform: 'web'`.
The sign-in page and `LaunchWebIDEButton` both call this and prefer `bridgeUrl`
over the raw redirect. The sign-in page guards open redirects: only relative
paths or `https://<sub>.recoder.xyz` are allowed (`signin/page.tsx:36-40`).

**BYOK gate.** `LaunchWebIDEButton` checks `GET /api/user/ai-provider-keys`
before handing off; if the user has zero keys it shows an "API Key Required"
modal instead of dropping them into a dead IDE. The key check **fails open** on
network/5xx (continues to the IDE).

## 6. Gotchas

- **Most of the app is absent from this checkout (biggest landmine).** Only 11
  files under `app/` are git-tracked. Broad `.gitignore` rules
  (`*secret*`, `*token*`, `*password*`, `*apikey*`, `*api-key*`, `*api_key*`,
  see `.gitignore:130-230`) hide the whole tree; a long `!`-negation allow-list
  re-includes a verified-credential-free slice (auth pages, api-key docs/settings
  pages, the snapshot persistence layer, and these routes). This matches the
  documented "Gitignore Secret-Rule Landmine" in project memory. **Do not assume
  the app is only 11 files** — the real Next.js app (and the rest of `app/app/`,
  `app/lib/`, pages, components) lives in the prod/Docker build context.
- **Dangling imports you can't read here.** The tracked files import
  `@/lib/prisma`, `@/lib/auth-config`, `@/lib/auth-helpers`,
  `@/lib/internal-service-auth`, `@/lib/logger`, `@/lib/session-fallback`,
  `@/lib/session-provider`, `@/lib/auth-client`, `@/lib/config/platforms`,
  `@/components/SiteHeader` — **none of these modules are in the checkout.** They
  are gitignored/untracked, not missing in prod. You cannot verify their behavior
  from this repo state.
- **No tracked build config.** `app/package.json`, `next.config.*`, `tsconfig.*`
  are not tracked. The Dockerfile is the only authoritative build description.
  Script names other than `build` / `prisma generate` are unknown from source.
- **`app` is not a `pnpm-workspace.yaml` package member.** The workspace globs
  (`packages/*`, `apps/*`, `docker-backend`, `shared`, …) do **not** list `app`,
  yet the Dockerfile installs it with `pnpm install --filter ./app...` and copies
  `app/package.json` explicitly. So `app` participates in the install via path
  filter / lockfile, but isn't a declared member — easy to miss when reasoning
  about the monorepo graph.
- **`project_snapshots` is raw SQL, invisible to Prisma.** It won't appear in
  `schema.prisma`, migrations, or `prisma studio`. Its DDL lives only in
  `ensureProjectSnapshotsTable()` and is applied lazily at first call.
- **`$executeRawUnsafe` / `$queryRawUnsafe` everywhere in the snapshot module.**
  Inputs are passed as positional params (safe), but the "Unsafe" API means any
  future edit that string-builds SQL is an injection risk — keep params positional.
- **Two account models + one users model.** The schema has both `account` and
  `accounts` models and a single `users` model (no `user` model is tracked under
  this schema). The snapshot owner-fallback logic exists precisely because the
  same human can have differing ids across the auth/app split.
- **Dockerfile mirrors a separately generated Prisma `auth-client`** into
  `app/prisma/auth-client` (and `/app/prisma/auth-client` at runtime) because
  `@recoder/auth` uses a custom Prisma output path that Next standalone does not
  copy. If auth init warnings appear at runtime, this copy step is the place to
  look (`Dockerfile`, runner stage).
- **`.next/` is gitignored** (`.gitignore:423`) — build output, expected.
