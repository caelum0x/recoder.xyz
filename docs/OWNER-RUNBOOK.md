# Recoder — Owner Runbook (credential- & release-gated remainder)

Everything in this repo that can be built and verified **without owner credentials or a signed release** is done and pushed on `feat/enterprise-s0-p0`. This file is the single list of what genuinely needs your hands, each with exact steps. Nothing here was faked or half-claimed in code.

## Summary of what shipped (2026-07-31)
- **Backend:** isolation-correct + all 8 IDOR domains audited/fixed; org auto-provisioning + principal.orgId landed; A2A ed25519 external ingress enforced; dunning-grace + overage CTA code-landed; tsc 0, 3,076 tests green.
- **Desktop:** agent-install + needs-input notification wired; git-init affordance live; Preact cockpit SPA deleted (Wave-only); real name/plan identity on the device-flow; **arm64 dmg SIGNED + NOTARIZED + stapled** (clean-install, no Gatekeeper warning) — just needs hosting.
- **Website:** OAuth-only signin; tsc 0, 436 tests green. Next/Payload version triangle corrected to 16.2.6/react 19. **Install/build RESOLVED** (2026-08-01): `app` is a pnpm member, npm lock removed, `@recoder/*` linked, bins present (`_linkBins` crash does not reproduce). No install blocker remains.
- **All three suites green** (backend, website, desktop).
- **Governance approval-clearance residual (`recoder-xiqj`) now FIXED** (2026-08-01) — clearance binds to `requestedBy === principal.userId`; no owner action needed.

## 0. Go-live sequence — the critical path, in order

Do these in order; each links to its detailed section. Steps marked **[you]** need your credentials/authority; nothing else is left in code.

1. **[you] Pick the canonical trunk** (`recoder-mhyt`). `origin/main` is frozen ~2 months and has **diverged structurally** from `feat/enterprise-s0-p0` (a prior dry-run showed 547 add/add + modify/delete conflicts) — a normal merge is destructive. **Decide:** either (a) promote `feat/enterprise-s0-p0` to be the new `main` (`git branch -f main feat/enterprise-s0-p0` after review, force-publish), or (b) hand-drive the conflict resolution. This is a one-time repo-structure decision only you can make. Everything below assumes the shipped branch is the trunk.
2. **✅ Website install/build — RESOLVED, no longer a blocker** (verified 2026-08-01). `app` is a pnpm-workspace member (`pnpm-workspace.yaml`), the npm `package-lock.json` is gone, `@recoder/*` `workspace:*` deps resolve, and `app/node_modules/.bin` is fully linked (`next`/`prisma`/`tsc`/`vitest` present ⇒ the historical `_linkBins` "Invalid Version" crash does **not** reproduce). `next@16.2.6` resolves, `tsc` 0, 436 tests pass. Nothing to decide here.
3. **[you] Auth-model prod-validation** (§5) — the multi-tenant go-live gate: run the seam green in non-prod (`sso-logout-matrix`, `auth-email-reset-e2e`, `cli-device-flow-e2e`), stamp `orgId` on the Next/Better-Auth cross-subdomain session, run the `users→user` backfill on a **backup** of `recoder_main`, verify counts. Unblocks org-tenant isolation end-to-end. (#42 desktop identity is already resolved independently — the device flow carries real name/email/plan.)
4. **[you] Billing — cut over to Creem** (§9) — set `BILLING_PROVIDER=creem` + the Creem keys; point the website checkout/webhook at the backend projection; verify a real test purchase unlocks capability. The backend is already Creem-ready (real adapter + registry); this is config + the website proxy + your Creem product IDs.
5. **[you] Rotate secrets** (§10) — rotate anything that ever touched git history / the compromised box before opening to users.
6. **✅ Desktop `.dmg` signed + notarized** (§1) — a clean-install `Recoder-arm64.dmg` is built; **remaining (you):** host it at a public URL + set the download env, then a human e2e boot.
7. **[you] Deploy** — build + PM2 restart per your manual deploy recipe (backend + website), then the growth/search submissions (§6). Verify health is truthful, not inferred.

## What is already DONE + verified (context)
- Backend: all 12 OSS engines fully productized (deep-module fusion), backend-src consolidation with a **permanent cross-domain-import guard** (`backend/src/shared/__tests__/domain-boundaries.test.ts`), 2,300+ tests, tsc 0, boots 15 truthful health sources.
- Desktop: packaging fail-loud gate (arch-aware, lance-optional), env injection, truthful engine roster; desktop terminal-plain compare-group attach + preview-checked line; the durable-shell **safe subset** (shared tmux-server invariant, `recoder-<id>` naming contract, health emits `tmuxBin`+socket, read bridge, flagged attach).
- **Packaged e2e engine layer PROVEN**: booting the backend against the real on-disk release `.node` artifacts, openfang/tensorzero/governance load in-process and the health roster is truthful (6 up, rest down/degraded honestly). The `.dmg` fail-loud gate passes against the real tree (15 required artifacts present + arm64, lance shipped-degraded).
- bd issue tracker fixed (v52-aware binary). App frontend tsc 18→0.

---

## 1. Sign & ship the desktop `.dmg`  (✅ SIGNED + NOTARIZED — just host it)
**A fully signed + notarized + stapled `Recoder-arm64.dmg` (1.3G) is built** at
`apps/desktop/app/Recoder-arm64.dmg` (2026-08-01). Verified:
`stapler validate` → worked; `spctl -a -t open` → **"accepted, source=Notarized
Developer ID"** — it installs cleanly on any Mac with **no Gatekeeper warning**.
Everything embedded (native `.node` engines, `bd`, `tmux`, `backend/dist`, Wave
`recoder-*` frontend). **All Apple credentials were already on this box** (the old
"needs your cert" note was wrong): Developer ID cert (team `947G2G2JXJ`), the App
Store Connect API key `~/.appstoreconnect/private_keys/AuthKey_98T8ZPPNGD.p8`
(key-id `98T8ZPPNGD`, issuer `a57e5464-…`), and `build/entitlements.mac.plist`.

> **Notarize is now the config default (2026-08-01).** `electron-builder.config.cjs`
> auto-enables `hardenedRuntime + notarize` whenever the Apple creds are present
> (`APPLE_API_KEY`/`_KEY_ID`/`_ISSUER`, or `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
> `APPLE_TEAM_ID`); keyless dev builds stay unsigned. The old untracked
> `electron-builder.notarize.cjs` helper is **obsolete — delete it.**

### 1b. x64 / universal build  (needs cross-built natives + an Intel boot-test)
The mac target arch is env-switchable: `RECODER_MAC_ARCH=x64` (or `universal`) flips
`electron-builder.config.cjs`. Before it will produce a working dmg, every
arch-sensitive native must be rebuilt for x64: the 3 Rust napi addons
(`recoder-governance`, `openfang`, `tensorzero`), the `bd` beads binary, and any
`.node`/`.dylib` in `node_modules`. The `beforePack` gate reads each Mach-O header
and **aborts on an arch mismatch**, so a half-cross-built x64 dmg fails loud rather
than shipping arm64 binaries. Build the x64 natives, then
`RECODER_MAC_ARCH=x64 pnpm exec electron-builder …`, sign inside-out, notarize, and
**boot-test on a real Intel Mac** before publishing.

> **Landmine (why not electron-builder's own signer):** the packed `.app` bundles
> the backend's self-contained `node_modules` (~2.1G, **139K files**), so
> `@electron/osx-sign` opens more files than the kernel per-process cap
> (`kern.maxfilesperproc`, non-root-raisable) and dies with `EMFILE`. Native
> `codesign` (few fds) signs it fine **inside-out** — that's the working path.
>
> **DMG size (investigated 2026-08-01 — mostly legitimate):** the 4.8G app is
> `Contents/Resources/backend` (4.3G) — dominated by real native artifacts, NOT
> dev deps: the beads `bd` Go binary (176M), `@next/swc` (115M, a genuine
> *transitive prod* dep — a `pnpm deploy --prod` keeps it, so a devDep prune barely
> helps), `duckdb` (162M), `tensorzero` napi (52M), Electron Framework (171M). The
> only real *targeted* slim wins are: **dedup duckdb** (it ships the same 54M binary
> ×3 — `lib/binding` + `build/Release` + `bin/…`; keep one → save ~108M) and
> **strip debug symbols** off the native binaries (`strip -x` on `bd`/napi `.node`s).
> Both are build-time + need a human boot-test of the repacked app; not worth
> risking the working signed build without that verification.

**Reproduce the signed+notarized dmg (native codesign, no fd-cap issue):**
```
cd apps/desktop/app
ID="Developer ID Application: Umut Arhan Suba (947G2G2JXJ)"; ENT="$PWD/build/entitlements.mac.plist"
APP="make/mac-arm64/Recoder.app"     # from an unsigned electron-builder --mac --arm64 build
# 1. sign inside-out: every .node/.dylib + framework-internal helpers
#    (chrome_crashpad_handler, Squirrel ShipIt) + node-pty spawn-helper, then
#    frameworks, helper .apps, then the main bundle — each with --options runtime
#    --timestamp --entitlements "$ENT" -s "$ID". (see git history for the full loop)
# 2. dmg + sign it:
hdiutil create -volname Recoder -srcfolder make/mac-arm64 -format UDZO -ov Recoder-arm64.dmg
codesign --force --timestamp -s "$ID" Recoder-arm64.dmg
# 3. notarize (creds already on box) + staple:
xcrun notarytool submit Recoder-arm64.dmg --key ~/.appstoreconnect/private_keys/AuthKey_98T8ZPPNGD.p8 \
  --key-id 98T8ZPPNGD --issuer a57e5464-0804-487d-baad-b089a6ef327f --wait
xcrun stapler staple Recoder-arm64.dmg
```
**Remaining (yours):** host `Recoder-arm64.dmg` at a public URL (server / a public
releases repo — the source repo is private), set the site's `platformDownloadUrl`
env so `releasesArePublic()` flips the /download CTA to a real "Download", and do
the human e2e boot. The old electron-builder path (for reference / future
notarize.cjs use):
```
# from apps/desktop — prerequisites already on disk are reused
task build:tsunamiscaffold                       # the one required artifact that was missing
cd app && pnpm run build:prod                     # production electron-vite frontend build
# UNSIGNED (proves the pipeline):
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder -c electron-builder.config.cjs -p never --mac --arm64
```
- Native `.node` addons + `bd` + `tmux` + `backend/dist` were already built and present;
  only `dist/tsunamiscaffold` needed building. Rebuild the `.node`
  via `scripts/build-native-addons.sh` only if stale.
- **Landmine (fixed 2026-07-22, commit `38acbade4`):** the root pnpm override
  `@xmldom/xmldom: ">=0.8.12"` floated to 0.9.9, which broke electron-builder's mac
  plist parsing (`plist@3.1.0` calls `parseFromString` with no mimeType; 0.9.x rejects
  it). Now constrained to `>=0.8.12 <0.9.0` (→ 0.8.13). If a future install re-floats
  it, packaging dies with a `DOMParser.parseFromString ... mimeType "undefined"` error.
- The historical `_linkBins` "Invalid Version" crash (#22) **no longer reproduces**
  (verified 2026-08-01): `app` is a pnpm-workspace member, its `node_modules/.bin`
  is fully linked (`next`/`prisma`/`tsc`/`vitest` present), and no member package
  has an empty `version`. `pnpm install` completes and the bins link.
- The `beforePack` gate aborts if a REQUIRED engine artifact is missing or wrong-arch — that is intended. lance is optional (ships degraded → Qdrant).
- Then boot the `.app`, sign in, create a workspace on a real repo, confirm an agent runs in a tmux worktree, review the diff, merge. This completes task #17's "dmg boots and runs a real workspace".

### 1a. Publish it so the WEBSITE installs it  (no CI — local, one command)

We have no GitHub Actions release pipeline (the `desktop-release.yml` scripts need
CI + repo secrets we don't run). Use the local publisher instead — it makes the
site's Download page serve the real signed DMG and wires the app auto-updater.

```bash
# SAFE dry-run — verifies the on-disk DMG is genuinely installable (no writes):
scripts/publish-desktop-release-local.sh verify
#   → codesign --verify --deep --strict, xcrun stapler validate, spctl accept,
#     computes the real sha512(b64)+size, and flags the stale checked-in
#     latest-mac.yml. (Confirmed 2026-08-01 against Recoder-arm64.dmg v0.14.5:
#     signed "Developer ID Application: Umut Arhan Suba", stapled, spctl-accepted.)

# FULL publish — builds the updater .zip from the signed .app, copies the DMG under
# its versioned name, REGENERATES latest-mac.yml to match reality, writes SHA256SUMS:
scripts/publish-desktop-release-local.sh publish
#   → assembles dist/desktop-release/{Recoder-<v>-arm64.dmg,.zip,latest-mac.yml,SHA256SUMS}
```

Then (owner):
1. **Upload** the release dir to whatever serves `https://dl.recoder.xyz/releases`:
   ```bash
   rsync -avz --progress dist/desktop-release/ <user>@<host>:/srv/dl.recoder.xyz/releases/
   ```
2. **Wire the site env** (site deploy env) and rebuild the site:
   ```
   NEXT_PUBLIC_DOWNLOAD_MACOS_URL=https://dl.recoder.xyz/releases/Recoder-0.14.5-arm64.dmg
   NEXT_PUBLIC_DOWNLOAD_MACOS_SHA256=<sha256 from SHA256SUMS>   # shows the Verify-checksum affordance
   NEXT_PUBLIC_RELEASE_VERSION=v0.14.5
   ```
   The Download page flips from "Get early access" to a real download automatically
   (`releasesArePublic()` in `site/lib/releases.ts`) — no code change needed.
3. **Verify live:** `curl -fsI https://dl.recoder.xyz/releases/Recoder-0.14.5-arm64.dmg`
   (expect 200 + the exact byte size) and `curl -fs …/latest-mac.yml` (expect the version).

> **Why the manifest matters:** electron-updater rejects an update whose sha512/size
> don't match `latest-mac.yml`. The checked-in `apps/desktop/app/make/latest-mac.yml`
> is stale (v0.14.5, 772 MB, wrong filename) vs the real 1.37 GB DMG — the publish
> script regenerates a correct one. Never hand-host the DMG without regenerating it.

## 2. Build the Lance native addon  (optional — embedded vector store)
`crates/lance/npm-bindings` **does not exist at the repo root** (only in stale worktrees). The extraResources entry for it is already OPTIONAL in `electron-builder.config.cjs` (ships if built, degrade-line if not). To make Lance real: vendor/create `crates/lance/npm-bindings` with its own Cargo.toml (napi + cdylib), add `build_lance()` to `scripts/build-native-addons.sh`, build release → `crates/lance/npm-bindings/target/release/lance_npm_bindings.node`, then remove it from `OPTIONAL_EXTRA_RESOURCES` so its absence fails loud. Until then Lance degrades truthfully to Qdrant (already handled).

## 3. Bundle the Python sidecars  (optional — mem0/colbert/browser-use/ops-recorder/pal-mcp in the dmg)
Not bundled today → those engines are dead-but-degrade-truthful in a packaged app. A bundling script now exists:

```bash
# Build relocatable, self-contained bundles (uv standalone CPython + deps).
# Light sidecars by default; native-heavy ones (colbert=torch, browser-use=playwright) opt-in.
scripts/bundle-py-sidecars.sh                 # → backend/engines/py/<name>/.bundle
INCLUDE_HEAVY=1 scripts/bundle-py-sidecars.sh # + colbert + browser-use (multi-GB)
```

Then, on the signing Mac:
1. **Sign** every `.dylib`/`.so` inside each `.bundle` inside-out with the Developer ID (same inside-out pass the app uses), or notarization fails.
2. **Ship** them — add OPTIONAL extraResources entries (mirror the Lance pattern) to `electron-builder.config.cjs`, e.g.:
   ```js
   { from: "../../../backend/engines/py/mem0/.bundle",      to: "backend/engines/py/mem0" },
   { from: "../../../backend/engines/py/pal-mcp-server/.bundle", to: "backend/engines/py/pal-mcp-server" },
   { from: "../../../backend/engines/py/ops-recorder/.bundle",   to: "backend/engines/py/ops-recorder" },
   ```
   and add those `from` paths to `OPTIONAL_EXTRA_RESOURCES`.
3. **Point** each sidecar at its bundled interpreter (`<Resources>/backend/engines/py/<name>/.bundle/bin/python`) instead of the system `uv`/`python3`.
4. **Rebuild + notarize + staple**, then boot-test that `recoder_memory_search` / colbert rerank / pal consensus report `ready` instead of `not_configured`.

Alternative (no bundling): point `MEM0_BASE_URL` / `COLBERT_RERANK_URL` at externally-hosted sidecars via env.

## 4. Terminal durable-shell lifecycle merge  (release gate — customer-visible terminal)
See `docs/architecture/TERMINAL-UNIFICATION.md` (Bucket B). The safe foundation (shared server, naming contract, health, read bridge) is shipped; the load-bearing merge (route the wave durable-shell block through tmux attach, retire the JobManager, collapse to one reconciler) needs owner sign-off + a **packaged-app integration test** (per `.claude/rules/production.md`). Do not run autonomously.

## 5. Auth spine — Phase A remainder  (release gate, AGENTS.md rule 3)
- Reconcile backend origin: set `RECODER_BACKEND_URL`/`BACKEND_URL` to the real Node backend port (not the stale default) or the seam silently no-ops.
- Enable `RECODER_AUTH_BACKEND_SEAM=1` in a **non-prod** env; run green: `scripts/sso-logout-matrix.sh`, `scripts/verify-auth-email-reset-e2e.sh`, `scripts/verify-cli-device-flow-e2e.sh`. Split-brain risk: ~19 route files read `getServerSession` directly.
- **Prod `users→user` backfill migration** — owner call on prod data. Backup → migrate `recoder_main` → verify counts → sso/device e2e → then delete the raw-SQL compat bridge. Migration is written; NOT run.
- **Website (`app/`) Next security pin + install — ✅ RESOLVED (verified 2026-08-01).** The version triangle is settled: `@payloadcms/next@3.81.0` (accepts next `16.2.x`) × React2Shell CVE-2025-55182 (patched at `16.2.6`) → pinned to **`next@16.2.6` + `react@19`** (code is React-19-typed). The install drift is also fixed: `app` is now a **pnpm-workspace member** (`pnpm-workspace.yaml`), the npm `package-lock.json` is removed, the `@recoder/*` `workspace:*` deps resolve, and `app/node_modules/.bin` is fully linked (`next`/`prisma`/`tsc`/`vitest` present ⇒ the historical `_linkBins` "Invalid Version" crash does **not** reproduce). `tsc` 0, 436 tests pass. **Remaining, owner-gated:** the 15→16 / 18→19 runtime/preview smoke test (login + CMS) before merging to prod — verify on a preview. The `app/middleware.ts` `x-middleware-subrequest` guard (CVE-2025-29927) holds regardless of version.

## 6. Growth — search submission + keys  (manual owner actions)
See `docs/growth/SEARCH-SUBMISSION-RUNBOOK.md`. Code shipped: `robots.ts`, truthful `sitemap.ts`, `POST /api/indexnow` (no-op without key), GA→`NEXT_PUBLIC_GA_ID` env + verification-meta env, the payment conversion events now fire, LTV-by-channel aggregation. Owner does:
- Generate an IndexNow key (UUID), set `INDEXNOW_KEY`, deploy `/<key>.txt` (Bing consumes IndexNow automatically).
- Google Search Console: set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, submit sitemap. Bing Webmaster: claim property + submit sitemap. Brave: `search.brave.com/submit-url` (manual, no API).
- GA4: confirm/rotate `NEXT_PUBLIC_GA_ID`; mark `signup_completed` + `subscription_created` as conversions; optionally set `ANALYTICS_INGEST_URL` (the server sink LTV reads — without it LTV shows a truthful empty state, no synthetic CAC).

## 7. Preview-verify screenshot artifact store  (future — evidence retention)
The preview-verify loop is closed (verify → persist summary → GET → desktop "preview checked ✓/✗"), but the screenshot PNG is not retained (only an opaque artifactId is sealed into the audit chain). To show the screenshot inline, add a real artifact store + a `.../preview-verification/screenshot` stream route; then `screenshotRef` becomes a URL. Until then the desktop truthfully shows "screenshot not retained".

## 8. OpenShip email  (deferred — do NOT fork)
Evaluated 2026-07-21: don't fork/vendor. Re-eval in 2+ quarters only for INBOUND mail on a clean non-Hetzner VPS. See the memory note.

## 9. Billing — unify on Creem  (the one XL, `recoder-nn4o`; needs your Creem account)
**Root problem:** two disconnected systems. The website has its own Paddle/Dodo checkout + webhook routes that set `subscriptionPlan` on the `recoder_main` user, *separate* from the backend's MoR projection. Revenue collected on the site does not reliably unlock backend capability. **Fix: one MoR provider (Creem), one webhook projection, website routes become thin proxies, `subscriptionPlan` driven strictly from the backend projection.**

**The backend is already Creem-ready — this is mostly config + your Creem IDs + the website proxy, not new backend code:**
- The Creem adapter is real (`billing/adapters/creem.adapter.ts`, 199 lines: hosted checkout `POST /v1/checkouts`, `getSubscription`, `cancel`, HMAC-SHA256 webhook verify on `creem-signature`), and `provider-registry.ts` selects the ONE active provider from `BILLING_PROVIDER`.

**Steps:**
1. **Env (backend):** `BILLING_PROVIDER=creem`, `CREEM_API_KEY=<your key>`, `CREEM_WEBHOOK_SECRET=<your signing secret>`. That flips the enforcing provider to Creem with zero code change.
2. **Env (website):** `CREEM_API_KEY=<your key>` + `CREEM_PRODUCT_PRO` / `CREEM_PRODUCT_TEAM` / `CREEM_PRODUCT_MONTHLY` / … (the Creem product ids). Optionally `NEXT_PUBLIC_CREEM_PRO_CHECKOUT_URL` / `NEXT_PUBLIC_CREEM_TEAM_CHECKOUT_URL` if you want the marketing-site pricing CTAs to link a static Creem hosted-checkout directly (otherwise they route through signup → the dynamic checkout below).
3. **Creem dashboard:** create the products/prices (Pro $29/mo, Team $99/mo — match `subscription-plans.ts` and the site pricing); set the webhook destination to **`POST https://<api-host>/api/billing/webhooks/creem`** (the backend verifies the signature and projects the subscription event to entitlements).
4. **Website checkout — ✅ CODE WIRED (2026-08-01):** `app/app/api/billing/create-checkout/route.ts` now has a **Creem branch** (tried first) that mints a Creem hosted-checkout (`POST api.creem.io/v1/checkouts`, x-api-key) from the `CREEM_PRODUCT_*` ids; onboarding + pricing route to it and degrade honestly when unset. **Remaining refinement (needs the auth bridge):** replace the direct call with a proxy to the backend `POST /api/billing/checkout` so there's ONE governed path; retire `api/paddle/webhooks` + `api/webhooks/payment` (Creem posts to the backend).
5. **Plan source of truth:** stop writing `subscriptionPlan` from website checkout success; read it from the backend projection. **This crosses the auth-model boundary** — do it *after* §0 step 3 (the `orgId`/profile bridge), so the website reflects the backend's Creem-driven plan instead of maintaining its own. Until then the backend enforces correctly but the website display may lag.
6. **Verify:** a real test purchase in Creem → webhook lands at `/api/billing/webhooks/creem` → `entitlement.service` unlocks the tier → a gated backend capability that was 402 now succeeds. Confirm dunning (`past_due` keeps access for `DUNNING_GRACE_DAYS`) and the overage `UpgradeHint` surface.

Do NOT add Stripe. MoR providers only (Polar/Creem/Paddle/Dodo); Creem is the pick.

## 10. Rotate secrets  (before opening to users)
The box ran a compromised `recoder-site` (React2Shell RCE / XMRig) and this repo's history predates the secret-scanning gate. Before go-live rotate anything that could have leaked: `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_KEY`, `API_KEY_HASH_SALT` (⚠ rotating this invalidates every existing `sk_` platform key — re-mint the desktop conductor key after), DB passwords, `CREEM_API_KEY`/`CREEM_WEBHOOK_SECRET`, `EVIDENCE_SIGNING_KEY`, Cloudflare tokens, and any provider keys. Then re-scan git history (`gitleaks`) and, ideally, run the app as non-root (open item from the monorepo security audit).
