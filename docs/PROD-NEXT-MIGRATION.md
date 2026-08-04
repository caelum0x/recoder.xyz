# Prod Next 15→16 / React 18→19 Migration Plan

Tracking: **bd recoder-kj5s** (prod-risky, owner-window only — this doc is the staged plan, NOT an execution record).

Status: **READY TO STAGE**. This is an analysis + plan. No prod behavior was changed producing it.

---

## 0. TL;DR / Verdict

- **Scope: app-only.** `recoder-backend` does **not** depend on the website's Next/React
  toolchain or `node_modules` (evidence §2). The migration re-links and rebuilds
  `app/` only.
- **Source is already migrated.** HEAD (`feat/enterprise-s0-p0`) `app/` source already
  uses the Next 15/16 async-`params` contract and contains **none** of the React 19
  removed APIs (evidence §1.3). The migration is a **dependency + `node_modules` +
  `.next` rebuild + pm2 cutover** — not a source rewrite.
- **The only shared-checkout coupling is the pnpm workspace install**, not runtime code:
  one root `pnpm-lock.yaml` (~1.45 MB) and one shared `.pnpm` store. A workspace-wide
  `pnpm install` on the box touches the store used by every member, and the box is
  disk-pressured (ENOSPC risk — see MEMORY `project_disk_constraint`). That is the real
  backend risk, and it is an **install-time / disk** risk, not a runtime-coupling risk.
- **Recommendation: GO in a single owner window**, app-only, using a build-in-place +
  `.next.rollback` cutover (§4). Backend needs **no redeploy**; it only needs to survive
  the shared install (contingency §4.6). Go/no-go criteria in §6.

---

## 1. The Gap (inventory)

Source of truth for the prod side: `/tmp/prod-app-package.json` (captured 2026-08-03 from
`/root/recoder.xyz/app`, branch `fix/agent-blockers-*`). HEAD side:
`app/package.json` on `feat/enterprise-s0-p0`.

### 1.1 Runtime dependency delta

| Package | PROD (15.4 tree) | HEAD (16 tree) | Break class |
|---|---|---|---|
| `next` | `15.4.11` | `16.2.6` | Major (App Router / config) |
| `react` | `^18.3.1` | `^19.2.0` | Major (React 19) |
| `react-dom` | `^18.3.1` | `^19.2.0` | Major |
| `@recoder/database` | `workspace:*` | **removed** | Workspace dep dropped |
| `@recoder/ui` | `workspace:*` | **removed** | Workspace dep dropped |
| `@recoder/ecosystem-config` | **absent** | `workspace:*` | Workspace dep added |
| `payload` / `@payloadcms/*` | `3.81.0` | `3.81.0` | **No change** (already co-pinned) |
| everything else | identical | identical | — |

Notes that matter:

- **Payload is already at 3.81.0 on both sides.** There is no Payload version bump in
  this migration — 3.81 already co-pins with Next 16 / React 19 on HEAD. The Payload risk
  is not "upgrade Payload", it is "does the already-pinned 3.81 render under the swapped
  React 19 runtime", which HEAD's own build proves (MEMORY `project_website_app_install_blocker`
  records `next build ✓` on HEAD).
- **`@recoder/database` and `@recoder/ui` no longer exist as HEAD workspace members.**
  `ls packages/database` → absent; `packages/ecosystem-config/package.json` name =
  `@recoder/ecosystem-config`. So prod's `package.json` references a package that is not in
  the current tree — a full-source overlay onto prod would leave a dangling `workspace:*`.
- **devDependencies are byte-identical on both sides** and already assume the new tree:
  both pin `@types/react ^19.2.7`, `@types/react-dom ^19.2.3`, `eslint-config-next ^16.0.4`.
  Prod therefore already runs a **type/lint toolchain for React 19 + Next 16 against a
  React 18 + Next 15 runtime** — a pre-existing drift the migration resolves, not creates.

### 1.2 Config surface (`app/next.config.js`) — already Next-16-shaped

`app/next.config.js` is already written to the Next 15.5+/16 shape; no config migration
is required:

- `serverExternalPackages` (not the old `experimental.serverComponentsExternalPackages`) —
  `next.config.js:63`, with the WHY comment "moved from experimental in Next.js 15.5+".
- `outputFileTracingRoot` is top-level (not under `experimental`) — `next.config.js:16`.
- `turbopack: { root, resolveAlias }` is the stable top-level key — `next.config.js:48-58`.
- `experimental: {}` is empty — `next.config.js:60`.
- `react/compiler-runtime` is aliased to a local shim for Payload in **both** webpack and
  turbopack — `next.config.js:40-43` and `:55-57`. This is the one config-level React-19
  seam; it is already present.

### 1.3 React 19 removed/changed-API audit (app source) — CLEAN

`grep -rln --include="*.ts" --include="*.tsx" --exclude-dir=node_modules` over `app/`:

| Pattern (React 19 removed/changed) | Files hit |
|---|---|
| `useFormState` (→ `useActionState`) | **0** |
| `ReactDOM.render` / `ReactDOM.hydrate` | **0** |
| `react-dom/server` `renderToString` | **0** |
| `.defaultProps` on function components | **0** |
| `PropTypes` | **0** |
| `forwardRef` | 6 (see below) |

The only hit is `forwardRef` in six recovered UI primitives:
`app/components/ui/{label,progress,card,alert,button,input}.tsx`. **`forwardRef` is not
removed in React 19** — it is soft-deprecated in favor of ref-as-prop and continues to work.
These are **future cleanups, not migration blockers**.

### 1.4 Next 16 async-`params` audit — ALREADY MIGRATED

The Next 15→16 breaking contract (route/page `params` and `searchParams` are `Promise`s)
is already applied in HEAD source. Concrete evidence:

- `app/app/api/chat/[chatId]/github/route.ts:8` — `context: { params: Promise<{ chatId: string }> }`,
  awaited at `:10` (`const params = await context.params;`). Same shape for the second
  handler at `:61,:63`.
- `app/app/api/projects/[projectId]/route.ts:46` — `{ params }: { params: Promise<{ projectId: string }> }`,
  destructured via `const { projectId } = await params;` at `:55` (and again `:104,:112`).
- `app/app/[locale]/layout.tsx:16` — `params: Promise<{ locale: string }>`, `await`ed at `:18` and `:49`.

There are 182 `route.ts` handlers under `app/app/api`. The audited samples across
dynamic segments all use the async-`params` shape. **The grep hits for `params.<x>` in
handlers are post-`await` local reads, not the removed sync access.** This is why HEAD's
`app/` already builds under Next 16.2.6.

### 1.5 Middleware — compatible, hardened

`app/middleware.ts` uses `next-intl/middleware` + `next/server` `NextRequest/NextResponse`
(`:1-2`) — the stable middleware API, unchanged across 15→16. It also carries a
CVE-2025-29927 `x-middleware-subrequest` reject (`:88-90`) and a server-action-id guard
(`:92-98`) that are framework-version-independent (enforcement below the framework, per
`.claude/rules/security.md`). The `matcher` config (`:202-207`) is standard. **No
middleware migration needed.**

### 1.6 Prebuild security gate — both versions pass their own gate (with a caveat)

`app/scripts/verify-next-security.js` runs as `prebuild` and hard-fails the build on an
unsafe Next version. Its floor table:

- major 16 → requires `>= 16.0.10`. **HEAD 16.2.6 passes.**
- major 15.4 → floor `15.4.10`. **Prod 15.4.11 passes** the app's own gate.

Caveat / WHY this migration still closes a real gap: the gate's 15.4 line (`15.4.10`) lags
the React2Shell advisory patch level that forced the sibling marketing site to `15.5.18`
(MEMORY `project_server_xmrig_miner`, `project_prod_nginx_two_next_apps`). Prod is
mitigated at the edge (nginx POST-block) but is not on the advisory patch line. Moving to
16.2.6 clears the 16.0.10 floor and closes this properly.

---

## 2. Risk Map — website vs recoder-backend

### 2.1 Does recoder-backend depend on app's toolchain? NO.

- `grep -nE '"(next|react|react-dom)"' backend/package.json` → **no matches.** Backend has
  no Next/React dependency at all.
- Backend's only `@recoder/ui*` dep is `@recoder/ui-agent-os` (`backend/package.json:66`), a
  **different** package from the app's dropped `@recoder/ui`.
- Backend build/run is self-contained: `"build": "tsc"`, `"start": "node dist/server.js"`
  (`backend/package.json:8-9`). It ships compiled `dist/`, not app's `.next`.

**Conclusion: at the runtime/code level the migration is app-only. Backend cannot break
from the Next/React swap because it does not consume it.**

### 2.2 The one real coupling: shared pnpm workspace install

- One root `pnpm-lock.yaml` (~1.45 MB) governs every member; `app` and `backend` are both
  members (`pnpm-workspace.yaml`).
- Bumping `app/package.json` and running a workspace `pnpm install` on the box **regenerates
  the root lockfile and rewrites the shared `.pnpm` store**. Backend's own resolved deps do
  not change, but the install *process* touches the store backend links into.
- The box is disk-pressured (MEMORY `project_disk_constraint`: near-full APFS; a mid-install
  ENOSPC "blocks ALL tools"). A failed/partial install is the way this migration could
  collateral-damage the 47-day-up backend.

**So the backend risk is install-time and disk, not runtime.** The plan below isolates the
install (§4.2) and gives backend a survival contingency (§4.6).

### 2.3 What breaks the WEBSITE (the actual migration surface)

| Surface | Risk | Mitigation |
|---|---|---|
| Dangling `@recoder/database` / `@recoder/ui` if source not fully swapped | install/build fails | Deploy HEAD `app/` **wholesale**, never overlay onto prod's package.json (§4.1) |
| React 19 runtime under Payload 3.81 | render regressions in `/cms`, admin | `react/compiler-runtime` shim already wired (§1.2); smoke `/cms` (§5) |
| Next 16 build memory | OOM on box (MEMORY `project_prod_deploy_pm2`) | `NODE_OPTIONS=--max-old-space-size=6144` + `/swapfile-deploy` (§4.3) |
| `next-intl` v4 + Next 16 locale routing | broken `[locale]` redirects | smoke locale + protected-route redirect (§5) |
| Better Auth session cookie edge check | auth redirect regressions | `verify-auth-email-reset-e2e.sh` + smoke (§4.4,§5) |
| Creem webhook path under new build | billing webhook 404/500 | route confirmed present `app/app/api/webhooks/creem/route.ts`; smoke (§5) |

Out of scope: `/download`, `/`, `/self-host` are served by the **separate** marketing site
(`:3012`, `/srv/recoder-site`, systemd — MEMORY `project_prod_nginx_two_next_apps`), not by
this app. The only `download` route in this app is
`app/app/api/billing/invoices/[id]/download/route.ts`. **Do not put the marketing `/download`
in this app's smoke gate.**

---

## 3. Branch strategy

- Migrate **from `feat/enterprise-s0-p0` (HEAD)**, which already carries the 16/19 tree +
  the Creem/account/oauth/entitlements work. Do **not** hand-edit prod's
  `fix/agent-blockers-*` package.json to bump versions — that produces the dangling
  `@recoder/database`/`@recoder/ui` (§1.1) and desyncs from the lockfile.
- Cut a release branch off HEAD (e.g. `release/next16-prod`), freeze it, validate on
  staging (§4.4), then deploy that exact commit. Record the commit SHA in bd recoder-kj5s.
- No repo-side compatibility shim is added by this task: HEAD source is already
  React-19/Next-16-ready (§1.3–1.5), so there is no safe pre-migration edit that changes
  prod behavior to make. The `react/compiler-runtime` shim that the migration needs is
  already committed (`app/next.config.js:40-43`).

---

## 4. Staged plan (exact sequence)

### 4.1 Pre-flight (local / staging, no prod touch)

```bash
# From HEAD or release/next16-prod, at repo root:
git rev-parse HEAD                      # record the deploy SHA into bd recoder-kj5s
pnpm --filter recoder-main-app... install --lockfile-only   # confirm lockfile resolves 16/19 with NO dangling workspace:*
node app/scripts/verify-next-security.js  # (invoked by prebuild) must pass for 16.2.6
```

Fail-closed gate: if `pnpm install --lockfile-only` reports an unresolved `workspace:*`
(e.g. a lingering `@recoder/database`), STOP — the branch is not clean.

### 4.2 Isolate the install on the box (protect backend)

```bash
# On prod, BEFORE any install:
pnpm store prune                        # reclaim disk (MEMORY project_disk_constraint)
df -h /                                 # confirm headroom; abort if <~5 GB free
cp -rf /root/recoder.xyz/backend/node_modules /root/recoder.xyz/backend/node_modules.bak  # backend survival snapshot
```

Prefer a filtered install so the store change is scoped and backend is not reinstalled:

```bash
pnpm --filter recoder-main-app... install --frozen-lockfile
```

`--frozen-lockfile` guarantees the box uses the validated lockfile from §4.1 (no silent
re-resolution). If the box cannot do a frozen install, that is a **no-go** for the window.

### 4.3 Build in place with rollback artifact

```bash
cd /root/recoder.xyz/app
[ -d .next ] && cp -rf .next .next.rollback     # rollback artifact (MEMORY prod deploy recipe)
NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/next build   # run detached; watch /swapfile-deploy for OOM
ls .next/BUILD_ID && test -d .next/standalone   # build success proof
```

### 4.4 Staging validation (before prod cutover) — the AGENTS verification defaults

Run the named e2e scripts against the staged build (all present in repo `scripts/`):

```bash
scripts/verify-auth-email-reset-e2e.sh      # auth (Better Auth cross-subdomain)
scripts/verify-byok-e2e.sh                  # BYOK / entitlements
scripts/verify-cli-device-flow-e2e.sh       # CLI device flow
scripts/sso-logout-matrix.sh                # SSO/logout matrix
pnpm --filter recoder-main-app test:unit    # app vitest
```

Do not proceed to §4.5 unless auth + billing scripts are green. Capture output as the run
artifact (per `.claude/rules/testing.md`).

### 4.5 pm2 cutover

```bash
pm2 restart recoder-app --update-env        # or the app's pm2 name; do NOT touch recoder-backend
pm2 status                                  # confirm recoder-backend still "online", uptime uninterrupted
```

### 4.6 Backend contingency (if the shared install disturbed backend)

```bash
# Only if recoder-backend errors after the install:
rm -rf /root/recoder.xyz/backend/node_modules
mv -f  /root/recoder.xyz/backend/node_modules.bak /root/recoder.xyz/backend/node_modules
pm2 restart recoder-backend
# Backend build output (dist/) is unchanged by this migration; it needs only its node_modules intact.
```

### 4.7 Rollback (website)

```bash
cd /root/recoder.xyz/app
rm -rf .next && mv .next.rollback .next     # restore prior build
pm2 restart recoder-app
# If deps must also revert: git checkout <prod-SHA> -- app/package.json && pnpm --filter recoder-main-app... install --frozen-lockfile
```

---

## 5. Smoke gate (curl matrix, post-cutover)

All targets are **this app's** surfaces (marketing `/download` excluded — different service):

```bash
BASE=https://recoder.xyz
curl -fsS -o /dev/null -w "%{http_code} account\n"  $BASE/en/account
curl -fsS -o /dev/null -w "%{http_code} billing\n"  $BASE/en/billing
curl -fsS -o /dev/null -w "%{http_code} cms\n"      $BASE/cms            # Payload-3.81-under-React19 smoke
# Creem webhook: POST an unsigned probe; expect 4xx (reject), NOT 404/500
curl -s -o /dev/null -w "%{http_code} creem-webhook\n" -X POST $BASE/api/webhooks/creem -H 'content-type: application/json' -d '{}'
# Protected route → must 3xx-redirect to /auth/signin when unauthenticated (middleware.ts:114-121)
curl -s -o /dev/null -w "%{http_code} protected-redirect\n" $BASE/en/dashboard
# Auth flow: run the e2e script as the real gate (curl only proves reachability)
scripts/verify-auth-email-reset-e2e.sh
```

Pass criteria: `/en/account` `/en/billing` `/cms` → 200 (or expected auth redirect);
Creem webhook → 4xx (reject, proving the handler is mounted); `/en/dashboard` → 3xx to
`/auth/signin`; auth e2e green. Any 404/500 on these = trip §4.7 rollback.

Confirmed-present routes on HEAD: `app/app/api/webhooks/creem/route.ts`,
`app/app/[locale]/account/page.tsx`, `app/app/[locale]/billing/page.tsx`.

---

## 6. Verdict & go/no-go criteria

**Verdict: app-only migration, one owner window. GO** — provided every gate below is green.
Backend does not require redeploy; it requires only surviving the shared install.

Go if ALL:
1. `pnpm --filter recoder-main-app... install --lockfile-only` (§4.1) resolves with **no
   dangling `workspace:*`** (proves `@recoder/database`/`@recoder/ui` are fully gone).
2. `verify-next-security.js` passes for 16.2.6 (§1.6).
3. Box has disk headroom after `pnpm store prune` (§4.2) — a frozen install can complete.
4. Staging auth + billing e2e scripts green (§4.4).
5. Backend `node_modules.bak` snapshot taken (§4.2) so §4.6 is available.

No-go if ANY:
- The migration is attempted as a package.json overlay onto prod's `fix/agent-blockers-*`
  branch instead of deploying HEAD wholesale (guarantees dangling workspace dep).
- The box cannot do a `--frozen-lockfile` install (uncontrolled re-resolution risk to the
  shared store the backend links into).
- Disk is too low for a clean build (ENOSPC would risk the 47-day-up backend mid-install).
- No owner present for the window (prod-risky, per bd recoder-kj5s).

---

## Appendix — evidence commands run producing this doc

- `bd show recoder-kj5s --json`
- diff `app/package.json` (HEAD) vs `/tmp/prod-app-package.json` (prod snapshot)
- React-19 API audit: `grep -rln --include="*.ts" --include="*.tsx" --exclude-dir=node_modules`
  for `useFormState|ReactDOM.render|renderToString|.defaultProps|PropTypes|forwardRef`
- async-`params` audit: reads of `app/app/api/chat/[chatId]/github/route.ts`,
  `app/app/api/projects/[projectId]/route.ts`, `app/app/[locale]/layout.tsx`
- backend independence: `grep -nE '"(next|react|react-dom)"' backend/package.json` (none),
  `backend/package.json:8-9,66`
- workspace: `ls packages/` (no `database`; `ui`, `ecosystem-config` present),
  `pnpm-workspace.yaml`, root `pnpm-lock.yaml` size
- config: reads of `app/next.config.js`, `app/middleware.ts`, `app/scripts/verify-next-security.js`

---

## 7. Staging validation run (2026-08-04)

De-risk pass executed on `feat/enterprise-s0-p0` HEAD against the **already-linked**
Next `16.2.6` + React/React-DOM `19.2.7` toolchain in `app/node_modules` (versions read
directly from `node_modules/{next,react,react-dom}/package.json`). No package versions
were changed. **No `app/` source fixes were required** — the source compiled and
type-checked clean under the 16/19 toolchain, which independently confirms the §1.3–1.5
"source already migrated" claim. This section records **real** command output.

### 7.1 Prisma client generate (build prerequisite)

```
$ ./node_modules/.bin/prisma generate
✔ Generated Prisma Client (v6.19.2) to ./../node_modules/.pnpm/@prisma+client@6.19.2_.../node_modules/@prisma/client in 5.47s
```

### 7.2 Prebuild security gate

```
$ node scripts/verify-next-security.js
[security] Next.js 16.2.6 passes the minimum patched-version gate.   # exit 0
```

### 7.3 Type check — CLEAN

```
$ ./node_modules/.bin/tsc --noEmit
# TSC_EXIT=0   — 0 errors, empty output
```

### 7.4 Unit/integration suite — GREEN

```
$ ./node_modules/.bin/vitest run __tests__
 Test Files  64 passed (64)
      Tests  524 passed (524)
   Duration  23.75s
# VITEST_EXIT=0
```

### 7.5 Production compile under Next 16.2.6 + React 19.2.7 — COMPILE SUCCEEDS

**What was run (and why):** the local APFS volume is disk-pressured (~2–9 GB free; MEMORY
`project_disk_constraint`). `app/next.config.js` sets `output: 'standalone'` (`:66`) with
`outputFileTracingRoot` = the **monorepo root** (`:16`), so a full `next build` ends with a
node-file-trace step that copies the *entire monorepo* (electron `.app`, tree-sitter
prebuilt binaries, beads Go sources, every `@esbuild/*` platform pkg) into
`.next/standalone/`. That copy needs many GB the local box does not have and ENOSPCs. On
the **prod box** this copy succeeds (its layout + disk differ); locally it cannot. To get a
provable, honest signal without risking an ENOSPC that "blocks ALL tools", the migration-
critical phase was run via `--experimental-build-mode=compile` (compiles every route /
page under the real 16.2.6 + Turbopack + React 19 runtime — the phase that would surface a
Next-16 route-handler signature break, a React-19 removed-API, or an async-`params` miss).
**This is a compile-mode build, not a full prerender build — stated plainly.**

```
$ NODE_OPTIONS=--max-old-space-size=6144 NEXT_TELEMETRY_DISABLED=1 \
    ./node_modules/.bin/next build --experimental-build-mode=compile
▲ Next.js 16.2.6 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 120s          # (2.4min on a cold first run)
  Collecting page data using 7 workers ...
  Finalizing page optimization ...
  Build ran with "compile" mode, to finalize the build run either "generate" or "generate-env" mode as well
⚠ Failed to copy traced files ... Error: ENOSPC: no space left on device
    copyfile '.../apps/desktop/.../Electron Framework.framework/.../libvk_swiftshader.dylib' -> '.../.next/standalone/...'
```

Compiled-output evidence captured before the standalone-copy step exhausted disk:

- `BUILD_ID` written: **`bSMN2LVfRi4W1Wj6Vm6lw`**
- `app-paths-manifest.json`: **270 route entries** = **185 API route handlers** (`route.js`)
  + **85 pages** (`page.js`), all emitted by the compiler.
- `routes-manifest.json`: **165 static + 105 dynamic** routes resolved.

**Interpretation:** the exit-1 is *entirely* the post-compile `output:'standalone'` NFT
copy hitting the local disk ceiling — **not** a source/type/API failure. The compiler
accepted 100% of `app/` under Next 16.2.6 + React 19.2.7. This is the same evidence class
as MEMORY `project_website_app_install_blocker` ("next build ✓ on HEAD").

### 7.6 Non-blocking warnings surfaced (record for the prod window)

The compile emitted three warnings that **do not block the build** but are Next-16 hygiene
items the owner should know about (none change the GO decision):

1. **`next.config.js` `eslint` key is unrecognized in Next 16** — "Unrecognized key(s) in
   object: 'eslint'". The block is silently ignored (build-time lint already runs via the
   separate `next lint`/CI path, and `eslint.ignoreDuringBuilds`-style config is no longer
   read here). Cosmetic; a future cleanup, not a blocker.
2. **`middleware` file convention is deprecated → rename to `proxy`** in Next 16. `app/middleware.ts`
   still loads and runs (§1.5 stands — functionally compatible), but Next 16 now emits a
   deprecation warning. Track a follow-up to rename `middleware.ts` → `proxy.ts`; **not**
   required for this cutover.
3. **Turbopack "overly broad file pattern" warnings** from `packages/auth/prisma/auth-client/index.js`
   (a `path.join(process.cwd(), …)` dynamic dirname) and `next.config.js` being pulled into
   the NFT trace. These are what inflate the standalone copy; they are pre-existing and
   version-independent (they'd warn on 15.x too). Optional future scoping.

### 7.7 Confidence update

The §6 **GO** verdict holds and is **strengthened**, not weakened, by this run:

- **No source breakage exists to fix** — `tsc` 0 errors + a clean Turbopack compile of all
  270 routes under 16.2.6/19.2.7 prove the async-`params` (§1.4) and React-19-API (§1.3)
  audits empirically, not just by grep. The migration remains a **deps + rebuild + cutover**,
  not a source rewrite.
- **App suite is green** (524/524) on the target toolchain.
- The one thing this local run could **not** exercise is the full prerender + `standalone`
  file-copy, which is **disk-bound, not code-bound**, and is exactly the risk §4.2–§4.3
  already call out (`pnpm store prune`, `df` headroom gate, `NODE_OPTIONS` heap cap,
  `/swapfile-deploy`). The prod box must have real headroom before §4.3 — that remains the
  **primary residual risk**, and it is an ops/disk risk, not a Next-16 correctness risk.
- Net: **the eventual prod migration is low-surprise on the code axis.** The owner window's
  remaining job is the disk/install choreography (§4.2–§4.6) and the post-cutover smoke gate
  (§5), plus optionally the two Next-16 hygiene renames in §7.6.

Commands are reproducible from `app/`:
```bash
./node_modules/.bin/prisma generate
node scripts/verify-next-security.js
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run __tests__
NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/next build --experimental-build-mode=compile
```

