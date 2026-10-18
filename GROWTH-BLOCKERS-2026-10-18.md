# Growth blockers — 2026-10-18

## FIXED, pushed, NOT YET LIVE: auth was returning 503 for every signup/signin

- Commit: `4b5bdb3d5d` on `main` (pushed, confirmed `git ls-remote origin main` matches local HEAD).
- Root cause: `app/app/api/auth/[...all]/route.ts` has proxied every sign-up /
  sign-in / sign-out / get-session call to `BACKEND_URL` since 2026-07-16
  ("Phase A" identity-unification). That separate backend was never deployed.
  Verified live before the fix: every call returned
  `HTTP 503 {"success":false,"error":"auth service misconfigured: BACKEND_URL
  points at this app's own port; no separate identity backend is
  configured"}`.
- Impact: nobody could create an account or sign in on recoder.xyz at all,
  which also blocks Pro/Team Dodo Payments checkout (checkout starts from an
  authenticated dashboard — `requireAuth()` in
  `app/app/api/billing/checkout/dodo/route.ts`). The free CLI
  (`npx recoder-code@latest`) still worked since it needs no web signup. This
  has blocked 100% of monetization on recoder.xyz for ~3 months while 30+
  other routes (2FA, API keys, CLI device flow, OAuth callbacks, checkout's
  own auth guard) kept correctly reading the local Better Auth instance in
  `lib/auth-config.ts` — only the one entry point the client SDK actually
  calls (`lib/auth-client.ts`) was pointed at the broken proxy.
- Fix: route serves the local `lib/auth-config.ts` Better Auth instance
  directly via `toNextJsHandler(auth)`, identical to the already-working
  `app/app/api/auth/callback/{google,github}/route.ts`. Kept CORS and the
  GET→POST social-sign-in redirect conversion, now against the local handler.

### UPDATE 2026-10-18 (later same day): manual deploy attempted, bypassing GitHub Actions entirely (owner explicitly asked not to rely on it — billing suspended, "I am poor," wants free self-hosted alternatives). Found and fixed two real build bugs along the way; blocked by a third, deeper one.

Built the app locally (`cd app && pnpm build`, mirroring `app-build.yml`'s steps) to deploy by hand via `rsync` + `pm2 restart` directly to `recoder-micro` (92.5.156.133, ssh `ubuntu` / key `~/.ssh/vcpeer_newbox_ed25519`) — completely free, no GitHub Actions involved, matches `deploy/deploy-site.sh`'s existing pattern for the marketing site. This is also the template for a **permanent free fix**: that same box is an obvious candidate to run as a GitHub Actions **self-hosted runner**, which makes `app-build.yml` work again for $0 regardless of the billing suspension (self-hosted runners aren't billed). Not yet set up — worth doing next.

Found and fixed for real (commit `c1b560d64d`, pushed to `main`):
1. `outputFileTracingExcludes` in `app/next.config.js` didn't cover `apps/desktop/engines`'s vendored multi-platform native binaries (tree-sitter prebuilds for every OS/arch) — Next's standalone trace was copying hundreds of MB of files the server never executes, exhausting disk on constrained build hosts (this Mac hit 0 bytes free twice during this work). Added the exclude, same pattern as the pre-existing esbuild exclude.
2. `prisma` and `@prisma/client` were missing from `pnpm.onlyBuiltDependencies` at the repo root, so their install scripts were silently skipped and the main app's Prisma client (`app/prisma/schema.prisma`) was never actually generated in a fresh checkout — only `packages/auth`'s client was, because that package defines its own explicit `postinstall` script that bypasses the allowlist gate; `app/` has no such script and relies on `@prisma/client`'s own postinstall, which the gate was blocking. Added both to the allowlist.

**Still blocked by a third, deeper issue — did NOT deploy, rolled back cleanly, production is unaffected (confirmed live: `recoder.xyz` → 200, local app health → still the known pre-existing 503, zero regression):**

After both fixes, a clean rebuild's compiled server chunks reference a module named `@prisma/client-9afada067027e79c` that does not exist anywhere — not in any source file, not in `pnpm-lock.yaml`, not in any `node_modules` tree (checked exhaustively). The Node File Trace manifests (`.nft.json` files under `.next/standalone/app/.next/server/app/**`) list it as an expected real path (`../../../../node_modules/@prisma/client-9afada067027e79c`), but nothing ever creates it, and the build logs don't show any file-copy failure for it either — it's simply never produced. This smells like a Next.js 16 + Turbopack + Prisma standalone-tracing bug (Next 16 made Turbopack the default bundler; this kind of synthetic hashed-external-module naming is a Turbopack internal, not a real pnpm/npm package convention), not anything wrong with this repo's own config. Runtime symptom when deployed anyway: `/api/auth/get-session` returns `500 Cannot find module '@prisma/client-9afada067027e79c'` instead of the original `503`, which is worse (auth was failing cleanly before; this fails with an unhandled exception) — hence the rollback.

**Next step for whoever picks this up:** try building with Turbopack disabled for this one build (check if Next 16 still supports a webpack fallback, e.g. an env flag or `next.config.js` bundler option) and see if the synthetic module reference disappears. If webpack isn't a viable fallback in Next 16, search Next.js's GitHub issues for "@prisma/client-" synthetic external + Turbopack standalone — this is specific enough that it's likely a known, possibly already-fixed-in-a-later-Next-patch issue. Backup of the broken build is preserved on the box at `/opt/recoder/run-app.broken-20261018` for comparison if useful; the known-good prior build is back in place at `/opt/recoder/run-app` (restored from `/opt/recoder/run-app.bak-20261018-011646`).

### OWNER-ONLY (superseded by the manual-deploy attempt above, kept for history): this fix cannot go live via CI right now — GitHub Actions is billing-blocked

Triggering the deploy build (`gh workflow run app-build.yml --ref main`)
fails immediately:

> The job was not started because recent account payments have failed or
> your spending limit needs to be increased. Please check the 'Billing &
> plans' section in your settings.

I deliberately did **not** build `app/` locally instead — this Mac has had
6 separate disk-full crises per memory notes, disk is currently at ~3.6Gi
free, and a cold `pnpm install --filter "recoder-main-app..."` for this
monorepo plus a Next.js standalone build is exactly the kind of operation
that has caused those crises before. Shipping this fix safely needs one of:

1. **Owner fixes GitHub billing** (Settings → Billing & plans, update
   payment method / raise spending limit on `caelum0x`), then re-run:
   ```
   gh workflow run app-build.yml --ref main
   gh run watch <run-id>
   gh run download <run-id> --name app-standalone
   RECODER_SERVER=ubuntu@92.5.156.133 RECODER_SSH_KEY=~/.ssh/vcpeer_newbox_ed25519 \
     app/deploy.sh --from-artifact app-standalone.tar.gz
   curl -s https://recoder.xyz/api/health
   ```
2. Or free enough local disk (not attempted here — too risky without an
   explicit go-ahead given the repeated crisis history) and run
   `RECODER_SERVER=ubuntu@92.5.156.133 RECODER_SSH_KEY=~/.ssh/vcpeer_newbox_ed25519 app/deploy.sh`
   directly, which builds locally then ships.

### Also worth a follow-up pass (not yet verified, out of scope for this one fix)

`app/app/api/billing/checkout/dodo/route.ts` itself proxies the actual
checkout-session creation to `BACKEND_URL` (default
`https://docker.recoder.xyz` in production) — once auth is live, verify that
target is actually reachable and wired to real Dodo Payments keys before
calling the checkout funnel fully fixed end-to-end.

### UPDATE 2026-10-18 (later still): FIXED and DEPLOYED — auth is live in production. Root cause was a real Turbopack+Prisma standalone-tracing bug; `--webpack` fallback works.

Picked up exactly where the previous pass left off (synthetic
`@prisma/client-9afada067027e79c` external that never exists on disk,
referenced by the Turbopack-compiled server chunks). Confirmed production
baseline unchanged first: `recoder.xyz` → 200, `/api/auth/get-session` →
503, matching the prior report — no drift.

**Reverted the uncommitted, abandoned experiment** sitting in the working
tree from the earlier pass (`app/package.json`/`app/tsconfig.json`/
`app/next-env.d.ts`/`pnpm-lock.yaml` — pinning `@prisma/client`'s exact
version and moving `prisma` to devDependencies). Confirmed via the
existing `.next/standalone` build on disk that this alone did **not** fix
the synthetic-module bug (the `.nft.json` trace files and the actual
compiled chunk `[root-of-the-server]__0vwyl4e._.js` still had
`e.x("@prisma/client-9afada067027e79c", () => require("@prisma/client-9afada067027e79c"))`
baked in) — so it was correctly abandoned, reverted cleanly to HEAD.

**Reproduced locally, then fixed for real:**

1. Ran `next build --webpack` (Next 16 still supports a webpack fallback
   via `next build --webpack`, confirmed with `next build --help`)
   instead of the Turbopack default. First attempt failed for an
   unrelated reason: webpack's css-loader enforces CSS Modules "pure
   selector" rules that Turbopack does not — a bare
   `button:disabled{opacity:.55;cursor:wait}` in
   `app/app/[locale]/admin/pilots/pilots.module.css` (no local class/id
   on that compound) failed with `Selector "button:disabled" is not pure`.
   Scoped it to the existing button selectors in that file
   (`.newPilot button:disabled,.complete button:disabled,.actions button:disabled`).
   Scanned every other `*.module.css` in `app/` for the same pattern
   (parenthesis- and comment-aware selector parse) — no other instances.
2. Rebuilt with the CSS fix — webpack build succeeded end to end. Grepped
   the resulting `.next/standalone` output: **zero** occurrences of
   `@prisma/client-[a-f0-9]{16}` anywhere (down from 179 `.nft.json` files
   and multiple real compiled chunks referencing it before). The auth
   route's compiled chunk now requires the real `@prisma/client` package
   name and resolves it correctly.
3. Made this permanent: `app/scripts/build-production.mjs` now calls
   `next build --webpack` instead of `next build`, so every future build
   via `pnpm build` (used by both `app/deploy.sh` and
   `.github/workflows/app-build.yml`) gets the fix automatically — this
   isn't a one-off manual flag, it's wired into the real build path.
4. Committed as `b532d1f4b6` (pushed, `git ls-remote origin main`
   confirms match), on top of `bc753d1291` (the self-hosted-runner CI
   routing commit that landed from the parallel runner-setup task while
   this was in progress — untouched, not mine).

**Deployed via the existing manual path** (`app/deploy.sh
--from-artifact`, same rsync/tar + `pm2 reload recoder-app` pattern as
before, run with `RECODER_SERVER=ubuntu@92.5.156.133
RECODER_SSH_KEY=~/.ssh/vcpeer_newbox_ed25519`). The script's own backup
step snapshotted the pre-deploy `run-app/` to
`/opt/recoder/backups/run-app.bak-20261018T024811.tar.gz` and
`/opt/recoder/run-app.prev-20261018T024811/` before swapping in the new
build, so a one-command rollback
(`mv /opt/recoder/run-app.prev-20261018T024811 /opt/recoder/run-app &&
pm2 reload recoder-app`) is available if anything regresses later.
`pm2 reload recoder-app` succeeded (new pid, confirmed no restart-loop
~2 min after reload).

**Verified live, both locally on the box and externally, after deploy:**

- `ssh ... curl http://127.0.0.1:3001/api/auth/get-session` → `200`,
  body `null` (correct "no session" response, not a crash).
- `curl https://recoder.xyz/api/auth/get-session` → `200`, body `null`.
- `curl -X POST https://recoder.xyz/api/auth/sign-in/social -d
  '{"provider":"github"}'` → `200`, returns a real GitHub OAuth authorize
  URL (previously `503`).
- Same for `"provider":"google"` → `200`, real Google OAuth authorize URL.
- `curl https://recoder.xyz` → `200` (no regression).
- `curl -X POST https://recoder.xyz/api/billing/create-checkout` → `401
  Authentication required` (correctly auth-gated now that auth itself
  works, not a second bug).
- `/auth/signup?plan=pro` and `/pricing` → `200`.
- Checked `pm2 logs recoder-app --err` for the exact `@prisma/client-`
  and "router state header" errors seen in the earlier broken-build
  incident — both are present in the log file but timestamped
  2026-10-18 ~01:45-02:00Z, i.e. from *before* this deploy (the earlier
  rolled-back attempt from the previous pass); nothing matching has
  appeared since the new pid came up. No `scheduled_emails`-table warnings
  or other errors are new/related.

**Auth itself is fully fixed and live.** One real secondary gap found
during verification, **owner-only, filed here rather than asked about**:
production's `GITHUB_CLIENT_ID` and `GOOGLE_CLIENT_ID` env values on the
box (`/opt/recoder/app.env.local`) are literally the placeholder strings
`your-github-oauth-client-id` / `your-google-oauth-client-id` — not real
OAuth app credentials. The sign-in endpoints now correctly build and
return an authorize URL (no more 503/crash), but clicking through would
currently hit GitHub's/Google's own "invalid client_id" rejection, since
no real OAuth app was ever registered/configured for production. This
needs real GitHub OAuth App + Google Cloud OAuth Client credentials
created and set as `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `/opt/recoder/app.env.local`,
then `pm2 restart recoder-app --update-env`. (Email/password signup is
disabled on this app per the earlier audit note, so OAuth is the only
signup path — this is the actual remaining blocker on new signups, not
a code bug.)

Also unresolved from the earlier pass, still worth a follow-up: the Dodo
checkout route's `BACKEND_URL` target `https://docker.recoder.xyz` still
does not resolve DNS — same category of "auth works, the thing behind it
isn't configured yet" gap, now that auth itself is no longer the blocker.

### Re-verified live 2026-10-18 (revenue audit pass) — still fully broken, deploy still blocked

- `curl https://recoder.xyz/api/auth/get-session` and
  `curl -X POST https://recoder.xyz/api/auth/sign-in/social -d '{"provider":"github"}'`
  both still return `HTTP 503 {"success":false,"error":"auth service
  misconfigured: BACKEND_URL points at this app's own port; no separate
  identity backend is configured"}` right now. `/auth/signup?plan=pro`
  renders fine (static HTML/CSS, OAuth-only — email/password signup is
  disabled on this app) but both "Continue with GitHub" and "Continue with
  Google" hit the broken endpoint above, so literally 0 signup paths work.
  `POST /api/billing/create-checkout` and `POST /api/billing/checkout/dodo`
  both correctly 401 "Authentication required" when hit unauthenticated —
  so checkout is unreachable end-to-end only because auth is down, not a
  second independent bug.
- NEW finding from this pass: `https://docker.recoder.xyz` (the
  `BACKEND_URL` the Dodo checkout route proxies to once a user is
  authenticated) does not even resolve DNS (`curl: Could not resolve host`).
  So even after the auth deploy ships, the Dodo checkout step itself will
  likely still fail until this host is fixed too — worth a second deploy
  check right after the auth fix lands, don't assume checkout is fixed just
  because signup works again.
- `gh run list` confirms GitHub Actions billing block is still live: every
  run since yesterday (including an explicit `app-build` workflow_dispatch
  attempt) fails in 4-5 seconds, consistent with the billing suspension
  described above. No change in owner-only blocker status.
