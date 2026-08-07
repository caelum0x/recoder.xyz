# Creem Billing — Prod Cutover Runbook (DEPLOYED)

**Status:** ✅ **DEPLOYED & VERIFIED LIVE 2026-08-07** via the fresh-dir method (owner-approved).
**Issue:** `recoder-t24j`  ·  **Branch:** `feat/enterprise-s0-p0` @ `90cb3a57b`
**Author:** staging + deploy pass 2026-08-07

## DEPLOY RESULT (2026-08-07)

The **full branch** was deployed to a **fresh worktree** `/root/recoder.xyz-next` (owner chose
"Ship full branch"), `recoder-app` (:3000) repointed to it; the old dir `/root/recoder.xyz`
(May-31 build) is left **untouched as instant rollback**.

- Worktree at `90cb3a57b`; scoped install (`--filter=recoder-main-app...`, non-frozen — branch
  lockfile drift: `jose@^6.1.0`); prod build clean, `BUILD_ID` written, `creem` route emitted.
- **Migrations applied** to `recoder_main` (DB backup at `/root/backups/recoder_main_pre-creem_*.sql.gz`):
  `20260804…_add_devicecode_devicename` (ALTER OK) + `20260718…_backfill_singular_identity`
  (idempotent: +31 singular sessions 3→34, users unchanged 43=43, 2 expected residuals).
- Canary on :3100 healthy → swapped to :3000. `recoder-app` online, 0 restarts, stable.
- **Public smoke (https://recoder.xyz):** home `200` · `/api/webhooks/creem` **404→401**
  `creem_invalid_signature` (route live + secret loaded) · `/api/subscriptions/plans` `200` ·
  `/auth/signin` `200` · `/download` (site :3012) `200`.

**Remaining (owner):** (1) run one real **Creem test-mode** purchase to confirm entitlement
unlock end-to-end; (2) **rotate the Creem API key** (shared in plaintext during setup).

---

## 1. Why this is a deploy, not an env flip

Prod `recoder-app` (`/root/recoder.xyz/app`, `:3000`, serves `/api/*`) currently runs a
**May-31 build** off branch `fix/agent-blockers-…` (`14296fc58`). That bundle has **no Creem
code**:

- `/api/webhooks/creem` → **404** (built providers are only `payment`/`paddle`/`dodo`).
- Deployed source has **zero** references to `BILLING_PROVIDER`; it selects a provider via
  `PAYMENT_PROVIDER` (polar/dodo auto-detect).
- Live Paddle/Dodo keys are literal placeholders (`…=your…`) → **prod billing is dormant**
  (free/manual mode). No real money path is live today.

The Creem integration (`app/lib/services/creem.service.ts`, `app/app/api/webhooks/creem/route.ts`,
plan mapping in `app/lib/config/subscription-plans.ts`) exists **only** on
`feat/enterprise-s0-p0`. Making Creem live therefore requires **rebuilding and redeploying
`recoder-app` from that branch** — an approval-gated billing/auth/customer-visible deploy that
also carries ~2 months of branch divergence.

## 2. Env already pre-staged (harmless on current build)

Appended to `/root/recoder.xyz/app/.env` (backup at `.env.bak.creem`); **inert** on the May-31
build (nothing reads them), becomes active only once the branch is deployed:

```
BILLING_PROVIDER=creem
CREEM_WEBHOOK_SECRET=<set>                         # Creem dashboard signing secret (whsec_…)
CREEM_PRODUCT_PRO-MONTHLY=prod_6J7s3a5JKHpMlGM3iu3fgl
CREEM_PRODUCT_PRO-YEARLY=prod_BTYlj7rPre5TA5Pt2rWdn
CREEM_PRODUCT_ENTERPRISE=prod_1aKlgnk0BoQ30tnBCi8jOz
# CREEM_API_KEY already present (line 168)
```

Creem products (created + validated live earlier): Pro-Monthly $29/mo, Pro-Yearly $290/yr,
Enterprise $99/mo. Webhook endpoint registered in Creem: `https://recoder.xyz/api/webhooks/creem`
(13 events enabled).

## 3. Pre-deploy verification (local, this pass)

- [x] `pnpm exec tsc --noEmit` — **0 errors in production/route/lib source** (8 errors are all in
  pre-existing `.test.ts` files, unrelated to Creem; `next.config.js` sets
  `ignoreBuildErrors: true` so the build ignores types regardless).
- [x] Creem money-path unit tests: **37/37 pass**
  (`creem-provider`, `creem-checkout-route`, `creem-webhook-route`, `payments-registry`,
  `subscription-plans`).
- [x] Full `pnpm run build` (`prisma generate && next build`) — **completes clean, 0 build errors.**
  `/api/webhooks/creem` emitted as a dynamic route (`ƒ`, full `route.js` artifact); `BUILD_ID`
  written. First attempt failed only because local env lacked `ENCRYPTION_KEY` (a runtime secret
  gate in `lib/encryption.ts`; **prod has it** — confirmed); re-run with a dummy key built clean.
  The 8 `⚠` warnings are cross-platform esbuild binary copies (android/ppc64/win32) into the
  `standalone` trace — irrelevant to the Linux prod server.

## 4. Deploy procedure (execute ONLY after approval)

Follows the proven recipe (memory: *Prod Website Deploy WORKS*). Sequential, no parallel SSH.

```bash
# On prod (ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19)
cd /root/recoder.xyz/app

# 0. Snapshot current known-good state for rollback
cp -rf .next .next.bak.pre-creem            # or: tar czf ../next-pre-creem.tgz .next
git rev-parse HEAD > ../DEPLOY_ROLLBACK_COMMIT.txt
pm2 save

# 1. Bring the app source to the branch commit (fetch + checkout feat/enterprise-s0-p0)
#    (exact fetch/checkout depends on prod git remotes — confirm before running)
git fetch --all --prune
git checkout feat/enterprise-s0-p0 && git pull --ff-only

# 2. Install + build (heap-capped; box OOMs Next builds — see memory)
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=6144 pnpm run build

# 3. Restart the app (Next re-reads .env, incl. the pre-staged Creem vars)
pm2 restart recoder-app
```

> Alternative (lower-risk): build the `.next` **locally** on this branch and rsync the built
> artifact + `package.json`/lockfile to prod, then `pm2 restart` — avoids building on the
> memory-constrained box. Chosen method to be confirmed at approval time.

## 5. Smoke tests (run immediately after restart)

```bash
# A. Webhook is deployed AND secret is loaded:
#    unsigned  -> 401 creem_invalid_signature  (NOT 404, NOT 503 creem_not_configured)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://recoder.xyz/api/webhooks/creem \
  -H 'Content-Type: application/json' -d '{"eventType":"subscription.active","object":{"id":"sub_x"}}'
#    expect: 401

# B. Signed happy-path (proves HMAC + normalize + upsert path). Build a valid signature:
BODY='{"eventType":"subscription.active","object":{"id":"sub_smoke","metadata":{"userId":"<test-user>","planId":"pro-monthly"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$CREEM_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -s -w "\n%{http_code}\n" -X POST https://recoder.xyz/api/webhooks/creem \
  -H 'Content-Type: application/json' -H "creem-signature: $SIG" -d "$BODY"
#    expect: 200 {"success":true,"processed":"subscription.created"}  + entitlement upserted for <test-user>

# C. Checkout resolves the right Creem product (authenticated call as a test user):
#    POST /api/subscriptions/checkout {planId:"pro-monthly"} -> returns a real api.creem.io checkout_url

# D. Regression: existing surfaces still 200 (home/app auth, /api/health), no 5xx spike in pm2 logs.
pm2 logs recoder-app --lines 100 --nostream
```

**Go/no-go:** A=401 AND B=200-with-entitlement AND C=real checkout_url AND D=clean → **GO**.
Any failure → **rollback (§6)**.

## 6. Rollback (fresh-dir method — repoint pm2 to the untouched old dir)

The old build at `/root/recoder.xyz/app` (May-31) was never modified, so rollback is just
repointing `recoder-app` back to it:

```bash
pm2 delete recoder-app
cd /root/recoder.xyz/app
NODE_ENV=production pm2 start /root/recoder.xyz/app/node_modules/.bin/next \
  --name recoder-app --cwd /root/recoder.xyz/app --interpreter bash -- start -p 3000
pm2 save
```

- The 2 migrations are **additive/non-destructive** — the old build ignores `DeviceCode.deviceName`
  and the extra singular `session` rows, so **no DB rollback is needed**. (If ever required, the
  full dump is at `/root/backups/recoder_main_pre-creem_*.sql.gz`.)
- The new worktree `/root/recoder.xyz-next` can be left in place (or removed later with
  `git worktree remove /root/recoder.xyz-next` from `/root/recoder.xyz`).
- pm2 interpreter **must be `bash`** (pnpm's `.bin/next` is a shell shim) or it crash-loops with
  `SyntaxError: missing )`.

## 7. Post-deploy

- Verify a real end-to-end purchase in Creem **test mode** before announcing.
- **Rotate the Creem API key** (`creem_…`) — it was shared in plaintext during setup.
- Close `recoder-t24j` with the smoke-test output attached as evidence.
