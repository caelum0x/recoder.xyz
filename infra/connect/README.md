# Recoder Connect

Accounts, remote reach, and Dodo billing for Recoder — a Cloudflare Worker.
Ported (config layer, not a literal file copy) from
`third_party/t3code/infra/relay`'s Alchemy/Effect-TS stack: this directory
is plain `wrangler`, and the database is box Postgres via Hyperdrive +
Workers VPC + a Cloudflare Tunnel (the pattern already live for Bidstage —
see `~/products/bidstage-tenders/wrangler.jsonc` and `DEPLOY.md`), not
relay's PlanetScale.

## What's real vs. gated

- **Checkout, webhook verification, entitlement storage, magic-link auth**:
  fully implemented, unit-tested (`pnpm test`). They are NOT stubs — given
  real Dodo/Scribase Mail credentials and a real Postgres, they work.
- **Mobile magic-link completion** (`GET /link/mobile-complete`,
  `src/auth/mobile-complete.ts`): closes the handshake Recoder Remote's
  client already expects (`apps/mobile/.../connectAuthClient.ts`'s
  `parseAuthCallbackUrl` / `RecoderAuthProvider.tsx`'s
  `magicLinkCallbackUrl()`, both on `feat/recoder-remote-mobile-2026-10-15`).
  The app's callback URL is same-origin with `CONNECT_URL`, so no
  `trustedOrigins` change was needed — Better Auth's verify-redirect lands
  on this route with the fresh session cookie already attached; it reads the
  raw cookie value and the signed-in user's email, then hands both back to
  the app as a `{RECODER_REMOTE_SCHEME}://auth/callback?token=...&email=...`
  deep link. `RECODER_REMOTE_SCHEME` is optional (defaults to
  `recoder-remote`, matching the app's own default) and is read ONLY from
  env, never from request input — accepting a caller-supplied scheme here
  would be an open redirect leaking a live session token.
- **Device linking** (`POST /devices/link/start`, `GET /devices/link/status`,
  `POST /devices/link/claim`, `GET /devices`, `POST /devices/:id/revoke`):
  fully implemented and unit-tested — a desktop generates a short-lived code
  (`src/auth/link-codes.ts`), the user claims it from an authenticated
  browser tab, and that creates a real `connect_devices` row. This is
  "link a desktop", NOT "open its live session" — see the managed-tunnels
  bullet below for what's still missing to make a linked device reachable.
- **Dodo products**: this product has no Dodo API key yet (confirmed absent
  from env and from every `*.env.example` in the repo, 2026-10-15). Nothing
  here fabricates product ids. `scripts/create-dodo-products.ts` creates the
  real Pro $29/mo, Pro annual $290/yr, and Team $99/mo products via the Dodo
  API the moment `RECODER_CONNECT_DODO_API_KEY` is set; until then it prints
  exactly what it would create and exits 0.
- **Hyperdrive / Workers VPC resources**: cannot be created without
  `wrangler login` (owner credential) and the box's tunnel id — see
  `scripts/create-hyperdrive.zsh`. `wrangler.jsonc`'s `hyperdrive[0].id` is a
  placeholder until that script runs.
- **Managed tunnels for `connect.recoder.xyz/*` device sessions** (actually
  opening a linked desktop's live session from another device, and minting
  the DPoP-bound credential that would authorize it): NOT built in this
  pass — the plan's own milestone for environment linking over a managed
  tunnel is a separate, later task (Dec 7 milestone in
  `plans/recoder-connect.md`). Device *linking* (pairing a desktop to an
  account — see above) is built; device *reach* is not.

## Setup (owner steps marked)

1. **Owner**: `wrangler login` on the Recoder Cloudflare account.
2. **Owner**: on the box, provision `recoder-connect-pg` (reuse the box's
   existing Cloudflare Tunnel — do not create a second tunnel), run
   `drizzle/0000_init.sql` then `drizzle/runtime-role-grants.sql` against it.
3. Run `scripts/create-hyperdrive.zsh` (needs the tunnel id + the runtime
   role's password from step 2); put the printed Hyperdrive id into
   `wrangler.jsonc`.
4. `wrangler secret put BETTER_AUTH_SECRET` (any strong random value),
   `wrangler secret put SCRIBASE_MAIL_API_KEY` (mint one per
   `~/products/plans/scribase-mail.md`'s per-app-key convention).
5. **Owner**: create a Dodo Payments business for Recoder, mint a test-mode
   API key. `export RECODER_CONNECT_DODO_API_KEY=... && pnpm dodo:sync-products`
   creates the three products and prints the ids to paste into
   `wrangler.jsonc`'s `vars`. Then `wrangler secret put
   RECODER_CONNECT_DODO_WEBHOOK_SECRET` using the signing secret from Dodo's
   webhook-endpoint setup (`https://connect.recoder.xyz/billing/webhooks/dodo`,
   subscribed to `subscription.*`).
6. `wrangler deploy` — run by the owner per this repo's existing manual-SSH
   deploy convention; not automated by this change.

## Local dev / test

```sh
npm install
npm test            # vitest, unit tests for every billing/auth/mail module
npm run check-types # tsc --noEmit
npm run db:generate  # diff src/db/schema.ts against drizzle/, after schema changes
```

This package is intentionally NOT a pnpm workspace member resolving
`@recoder/auth` from the monorepo — see the comment at the top of
`src/auth/connect-auth.ts` for why (that package's root export eagerly loads
a Prisma client, which is not Workers-compatible). It has its own
`package.json`/lockfile, same convention as `apps/desktop/cockpit`.
