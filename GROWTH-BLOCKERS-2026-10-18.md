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

### UPDATE 2026-10-18 (3rd pass same day): webpack fallback confirmed the fix — auth is LIVE in production.

`next build --webpack` avoids the Turbopack synthetic `@prisma/client-<hash>` externalization entirely; the webpack output `require()`s the real `@prisma/client` package name. `app/scripts/build-production.mjs` now builds with `--webpack` unconditionally, so both `pnpm build` (used by CI's `app-build.yml` and the manual deploy path) get this automatically going forward. One secondary build failure surfaced only under webpack's stricter css-loader: a bare `button:disabled{...}` selector in `pilots.module.css` violated CSS Modules' "pure selector" rule (Turbopack doesn't enforce this); scoped it to the existing button class. Scanned all other `*.module.css` files for the same pattern — none found.

Commits (pushed to `main`, verified via `git ls-remote`): `b532d1f4b6` (webpack build switch + CSS fix), `b2aad9fd6a` (this doc).

Deployed via the existing `app/deploy.sh --from-artifact` rsync+pm2 path to `recoder-micro`; pre-deploy state snapshotted (`/opt/recoder/run-app.prev-20261018T024811/` + tarball) for one-line rollback. `pm2 reload recoder-app` succeeded, stable for several minutes post-deploy, no restart loop.

**Verified live via curl:**
```
curl https://recoder.xyz                       → 200
curl https://recoder.xyz/api/auth/get-session   → 200 (body: null — valid "no session"; was 503 for ~3 months)
sign-in/social {github, google}                 → 200, real OAuth authorize URLs returned
```

**Last-mile blocker — OWNER-ONLY, no agent workaround exists:** production's `GITHUB_CLIENT_ID` / `GOOGLE_CLIENT_ID` in `/opt/recoder/app.env.local` are still the literal placeholder strings `your-github-oauth-client-id` / `your-google-oauth-client-id`. The auth code path is fully correct and returns a real OAuth authorize URL, but an actual signup attempt will still fail at GitHub's/Google's side with "invalid client_id" until real OAuth app credentials are created. **Owner action needed (~10 min, requires browser login so no agent can do this):**
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App (callback URL: `https://recoder.xyz/api/auth/callback/github`).
2. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (callback URL: `https://recoder.xyz/api/auth/callback/google`).
3. Set both client ID/secret pairs in `/opt/recoder/app.env.local` on `recoder-micro`, then `pm2 restart recoder-app --update-env`.

Email/password signup is disabled on this app, so OAuth is the ONLY signup path — this is the true last mile to the first real signup.

### UPDATE 2026-10-18 (4th pass, follow-up investigation): `docker.recoder.xyz` — CLOSED, not a real gap.

Investigated whether the Dodo checkout backend's reference to `docker.recoder.xyz` (which doesn't resolve in DNS) was a second deploy gap behind auth. It is not:

- That hostname belonged to a deliberately-retired "cloud-IDE plane." Two sibling proxy routes (`app/api/proxy/git`, `app/api/proxy/subscriptions`) already return `410 Gone` with comments explicitly stating this backend was retired and has no remaining consumers.
- The only two routes still referencing `docker.recoder.xyz` as `BACKEND_URL` (`app/api/billing/checkout/dodo`, `app/api/billing/checkout/paddle`) are orphaned dead code — grepped every frontend caller of checkout (`plan/page.tsx`, `onboarding/choose-plan/page.tsx`, `UpgradePlans.tsx`); all of them call `POST /api/billing/create-checkout` only, which talks to `DodoPaymentsService` directly with zero dependency on `docker.recoder.xyz`.
- Confirmed via SSH to `recoder-micro` that no Docker daemon is even installed and no process matches a backend that `docker.recoder.xyz` could ever correctly point to.
- Confirmed the real checkout route is live and correctly auth-gated: `curl -X POST https://recoder.xyz/api/billing/create-checkout` → `401 Authentication required` (exactly right for an unauthenticated request).

**Net: checkout itself is fully live right now.** No DNS record was added (there's no correct target — adding one would just point at nothing). Minor hygiene follow-up, zero revenue impact, whenever convenient: give `billing/checkout/dodo` and `billing/checkout/paddle` the same `410 Gone` treatment as their already-cleaned-up siblings.

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

## PR #34 security re-audit (2026-10-18): all 7 claimed items re-verified against current `main` + live prod — 6/7 already fixed/moot via later restructuring, 0 regressions from today's earlier `app/` auth deploy. PR #34 closed as superseded.

Full per-item evidence is in this session's report; summary for the record:

1. **Command injection (`fileMount.ts`/`secure-storage.ts`)** — fixed. The exact `exec→execFile` diff landed on `main` the day after PR #34 opened, via a separate direct commit `cb6a5097a` ("Complements PR #34"), byte-identical to PR #34's version of both files. `fileMount.ts` was later deleted entirely in the `docker-backend→backend` cleanup (Jul 14, commit `98b5ff91`) — the whole mount-via-tar feature is now dead code, not reachable from anywhere (grepped for `mountFiles`/`mountDirectory`, zero references). `secure-storage.ts`'s 2 remaining `execSync` calls (lines 23, 112) both run fully hardcoded command strings (`ioreg ...`, `security dump-keychain | grep "xyz.recoder.cli"` — the service-name constant, never `provider`/`apiKey`) — confirmed not attacker-reachable, no `execFile` conversion needed there.
2. **Auth bypass (`apps/agent-gateway`)** — moot/superseded. That standalone app no longer exists on `main` (only inside a broken, orphaned `.claude/worktrees/agent-ad9908e8ced52db64` whose `.git` backing path doesn't exist on disk — dead leftover, not a live branch, not deployed, not reachable from `main`). Its functionality was absorbed into `backend/src/domains/interop`'s signed-ingress gate, which is now *stricter* than PR #34 asked: `requireSignedIngress` defaults to `true` in production and `allowInsecureIngress` defaults to `false` (`backend/src/domains/interop/config.ts`), and with no verifier wired the gate **fails closed** (denies with `signed_ingress_unwired`) rather than failing open. The main HTTP server does bind `0.0.0.0` by default (`backend/src/bootstrap/config.ts:58`), but that's the general public API, not a separate low-auth internal gateway port — the specific concern PR #34 raised (a second, weakly-authed port) doesn't exist anymore.
3. **SSRF (`packages/langfuse/src/trace-generation.ts`)** — moot. The entire `packages/langfuse` package was deleted on `main` (commit `e41c2bb25d`, "remove Polar, lance, and the pure Giselle cluster"). No successor code does a comparable `fetch(variable_url)` against tracing/telemetry input.
4. **Exposed debugger (`sandbox.ts` `--inspect-brk`)** — fixed, confirmed still bound to `127.0.0.1` in the current file (`packages/recoder-code/packages/cli/src/utils/sandbox.ts:179`).
5. **Next/React version floor** — fixed on `main`, and *exceeded*: root `package.json` `next@16.2.6` (commit `411024bb4d`), `site/package.json` `next@15.5.18`/`react@19.1.7` (commit `bcf3809fdd`, same day as the exec fix, explicit message "Matches what's deployed + running on the server; prevents a redeploy re-introducing the RCE"). `app/package.json` (the app redeployed earlier today for the auth fix) resolves to `next@16.2.6` in `pnpm-lock.yaml` too — today's Turbopack→webpack build-fix deploy did **not** revert any Next.js version.
6. **Live production check** — SSH'd into `recoder-micro` (92.5.156.133) directly and confirmed on-disk, not just headers: `pm2 list` shows `recoder` (the `site/` marketing process) and `recoder-app` (the `app/` process) both `online`. `/opt/recoder/run-site/node_modules/next/package.json` → `15.5.18`. `/opt/recoder/run-app`'s resolved `next` package (via its pnpm store hash path) → `16.2.6`. `curl -D-` against `https://recoder.xyz/` and `/__site/` returns clean headers with no version leakage (Cloudflare+Caddy in front, no `X-Powered-By` version string) — consistent with safe config, and the direct SSH file check is stronger evidence anyway. **No exploit payloads were sent.** Conclusion: both `site` and `app` in production are on patched versions right now; today's unrelated auth-fix deploy did not reintroduce React2Shell.
7. **Credential rotation — STILL NOT DONE, owner-only, 4 months overdue.** See runbook below.

**Also fixed but not in PR #34's named list** (bonus hardening from the same `cb6a5097a` commit, re-verified still present after the refactor): `mcp-manager.ts`'s untrusted-JSON-RPC validation and `domain-manager.ts`'s RFC-1123 hostname allowlist both survived into their renamed successors (`backend/src/domains/engines/mcp/*`, `backend/src/domains/cloud/services/domains.service.ts`).

**Secondary, out-of-scope observation (not part of PR #34, not acted on this pass):** `apps/desktop/engines/dmux/src/**` (the local desktop worktree/pane manager) has ~20 `execSync` call sites that interpolate branch names, worktree paths, and commit messages into shell strings (e.g. `useWorktreeActions.ts`, `mergeExecution.ts`). This is a **local Electron desktop tool**, not production-server-reachable, so it's a different threat model than React2Shell RCE and wasn't part of PR #34 — flagging for a future dedicated pass, not treating it as part of this incident.

**Action taken:** Closed PR #34 (`gh pr close 34`) with a comment pointing at commits `cb6a5097a`, `bcf3809fdd`, `411024bb4d`, `98b5ff91` as the superseding history. No new code changes were needed on `main` — everything PR #34 asked for was already independently fixed before/around the time it was opened, just never through that specific PR.

### OWNER-ONLY RUNBOOK: credential rotation (PR #34 item 7 — outstanding 4 months, never flagged as urgent until now)

Git history containing these secrets was separately purged, but **purging history does not invalidate already-issued credentials** — if any of these were ever committed (even briefly) or exposed during the React2Shell root-compromise window, they must be rotated at the source, not just removed from git. None of this can be done by an agent (all require provider-account browser login). Exact vars live in `/opt/recoder/app.env.local` (prod) and local `.env` files — after rotating at the source below, update both and `pm2 restart recoder-app --update-env` / `pm2 restart recoder --update-env`.

1. **GitHub App keys** (`GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_PRIVATE_KEY`/`GITHUB_APP_PRIVATE_KEY_PATH`) — GitHub → Settings → Developer settings → GitHub Apps → the recoder app → "Generate a new private key", then delete the old key. Also rotate the App's client secret on the same page.
2. **GitHub OAuth App** (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`) — Settings → Developer settings → OAuth Apps → the recoder OAuth app → "Generate a new client secret", delete the old one. (Note: this is the SAME OAuth app that's currently still a placeholder per the auth-fix section above — doing this rotation now and setting the real values closes two gaps in one step.)
3. **Google OAuth Client** (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) — Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client ID → reset/rotate client secret, or delete and recreate the client if the ID itself may have leaked. Same note as above: currently a placeholder, so this is also a net-new real value, not just a swap.
4. **AWS** (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) — AWS Console → IAM → Users → the recoder service user → Security credentials → create new access key, then deactivate + delete the old key ID. (Note: owner is banned from AWS/Amazon per standing memory — confirm with owner whether this key is still needed at all, or should be removed entirely rather than rotated, since no AWS services should be in active use.)
5. **DODO Payments** (`DODO_API_KEY_LIVE`, `DODO_API_SECRET`, `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET`, `NEXT_PUBLIC_DODO_PUBLISHABLE_KEY`) — Dodo Payments dashboard → Developers/API Keys → regenerate live API key + webhook signing secret; update the webhook endpoint's secret in the same place it's configured.
6. **Database** (`DATABASE_URL`, `AUTH_DATABASE_URL`) — at the Postgres/Neon provider dashboard, rotate the DB user's password (or create a new role + migrate, then drop the old role), then update the connection string. Do this during a low-traffic window since it requires an app restart.
7. **Auth secrets** (`AUTH_SECRET`, `BETTER_AUTH_SECRET`, `NEXTAUTH_SECRET`, `UNIFIED_AUTH_SECRET`) — generate fresh random 32+ byte secrets (`openssl rand -base64 32`) for each; rotating these invalidates all existing sessions/tokens signed with the old secret, so expect every logged-in user to need to sign in again — low-impact right now since there are effectively 0 real signups yet, so this is the cheapest time to do it.
8. **LLM keys** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` + `OPENROUTER_API_KEY_1/2/3`, `PLATFORM_OPENROUTER_KEY_1/2/3`) — rotate at each provider's dashboard (Anthropic Console, OpenAI Platform, OpenRouter) by creating a new key and revoking the old one. Check usage logs at each provider first for any anomalous spend during the compromise window (around 2026-06-30) as a sign the old key was actually abused, not just theoretically exposed.

### UPDATE 2026-10-18 (5th pass, independent corroboration via full-history `gitleaks` scan — part of an OSS-readiness audit for a separate open-sourcing decision, see `oss-readiness-audit-4repos-2026-10-18.md` in memory)

Ran `gitleaks git --log-opts="--all"` across this repo's entire history (not just HEAD) — 1933 raw hits, independently hand-verified. This **confirms item 8 above is undercounted**: the actual exposure found in `recoder-desktop/app-bundles/chat/standalone/.env.production` (commit `3fe93e0608`, 2025-10-06) and in `FIXES_APPLIED.md`/`VERCEL_DEPLOYMENT_GUIDE.md` also includes real-format keys for providers not listed in item 8:

- `GROQ_API_KEY`, `MISTRAL_API_KEY`, `TOGETHER_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `FIREWORKS_API_KEY`, `CEREBRAS_API_KEY`
- 3× Google/GCP API keys (`AIzaSy...` format — likely `GOOGLE_GENERATIVE_AI_API_KEY`/Gemini, check `.env.example` for the exact var names these map to)

None of these files exist in current HEAD (already removed from the working tree), but remain fully recoverable from history via `git show <commit>:<path>` — purging alone doesn't help, same caveat as the rest of this runbook. **Add these 9 keys to the rotation pass in item 8** when the owner does it — same provider-dashboard pattern (Groq Console, Mistral Console, Together AI, DeepSeek Platform, xAI Console, Fireworks AI, Cerebras Cloud, Google AI Studio/Cloud Console).

Also found in the same files: a Neon `PGPASSWORD` (covered by item 6) and auth secrets (covered by item 7) — no new rotation categories, just further confirmation these were really committed, not hypothetical.

Separately, low-severity, not part of the PR #34 compromise window: a weak Grafana admin password (`RecoderAdmin123!`) is base64'd into `monitoring/comprehensive-dashboard.yaml` in history — internal monitoring only, not customer-facing, rotate opportunistically whenever convenient (no urgency).

Suggested order: do #7 (auth secrets) and #2/#3 (OAuth) together since #2/#3 already need real values entered for the unrelated signup blocker — one combined `pm2 restart --update-env` covers both. Then #1, #5, #6, #8, #4 in any order as time allows.

## 2026-10-18 (6th pass): FAQ content fix ready but can't deploy — no working SSH credential to the site box

Added a genuine FAQ entry to `site/app/page.tsx` (the real, JSON-LD-indexed homepage FAQ —
not `app/app/[locale]/faq/page.tsx`, which exists but isn't part of the deployed marketing
site) answering "do I need my own Postgres database to self-host the backend", honestly
naming Scribase as a managed option. Type-checked clean, `npm run build` succeeds, committed
and pushed to `main` (`e63a4f45cc`) — **not live yet**.

`site/` deploys via `deploy/deploy-site.sh`, which requires `RECODER_SERVER` (the box at
`92.5.156.133`) and `RECODER_SSH_KEY` env vars, and MUST build with `SITE_ASSET_PREFIX=/__site`
or its assets collide with the main app's. I have a key file (`~/.ssh/recoder_deploy`) but it
does not authenticate against `92.5.156.133` under `ubuntu`/`deploy`/`root`/`opc` — stopped
trying usernames after 4 attempts rather than risk a fail2ban-style lockout like the one that
hit `box` earlier today. The domain itself (`recoder.xyz:22`) gives "No route to host" (expected,
it's behind Cloudflare).

**To finish (~2 minutes once you have working SSH access):**
```sh
export RECODER_SERVER=ubuntu@92.5.156.133   # confirm the real user first
export RECODER_SSH_KEY=~/.ssh/<the-real-key>
cd ~/products/recoder.xyz && git pull
bash deploy/deploy-site.sh
curl -s https://recoder.xyz/ | grep -c "Do I need my own Postgres database"   # expect 1
```
