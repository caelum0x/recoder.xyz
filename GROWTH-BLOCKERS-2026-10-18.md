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

### OWNER-ONLY: this fix cannot go live via CI right now — GitHub Actions is billing-blocked

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
