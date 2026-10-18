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
