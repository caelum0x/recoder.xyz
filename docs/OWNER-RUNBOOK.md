# Recoder — Owner Runbook (credential- & release-gated remainder)

Everything in this repo that can be built and verified **without owner credentials or a signed release** is done and pushed on `feat/enterprise-s0-p0`. This file is the single list of what genuinely needs your hands, each with exact steps. Nothing here was faked or half-claimed in code.

## Summary of what shipped (2026-07-31)
- **Backend:** isolation-correct + all 8 IDOR domains audited/fixed; org auto-provisioning + principal.orgId landed; A2A ed25519 external ingress enforced; dunning-grace + overage CTA code-landed; tsc 0, 3,076 tests green.
- **Desktop:** agent-install + needs-input notification wired; git-init affordance live; Preact cockpit SPA deleted (Wave-only); arm64 dmg builds unsigned, packaging gate passes.
- **Website:** OAuth-only signin; tsc 0, 436 tests green. Next/Payload version triangle corrected to 16.2.6/react 19; install remains blocked by workspace protocol drift + bin-linking crash (needs owner decision between pnpm-member or concrete-version conversion).
- **All three suites green** (backend, website, desktop).

## What is already DONE + verified (context)
- Backend: all 12 OSS engines fully productized (deep-module fusion), backend-src consolidation with a **permanent cross-domain-import guard** (`backend/src/shared/__tests__/domain-boundaries.test.ts`), 2,300+ tests, tsc 0, boots 15 truthful health sources.
- Desktop: packaging fail-loud gate (arch-aware, lance-optional), env injection, truthful engine roster; desktop terminal-plain compare-group attach + preview-checked line; the durable-shell **safe subset** (shared tmux-server invariant, `recoder-<id>` naming contract, health emits `tmuxBin`+socket, read bridge, flagged attach).
- **Packaged e2e engine layer PROVEN**: booting the backend against the real on-disk release `.node` artifacts, openfang/tensorzero/governance load in-process and the health roster is truthful (6 up, rest down/degraded honestly). The `.dmg` fail-loud gate passes against the real tree (15 required artifacts present + arm64, lance shipped-degraded).
- bd issue tracker fixed (v52-aware binary). App frontend tsc 18→0.

---

## 1. Sign & ship the desktop `.dmg`  (needs your Apple Developer cert)
**The UNSIGNED package now builds end-to-end** (verified 2026-07-22): a full
`electron-builder --mac --arm64` produces `Recoder-darwin-arm64-<ver>.dmg` (+ `.zip`
+ `.app`, ~306 MB dmg) with every native engine shipped in `Contents/Resources/`
(`native/{openfang,recoder-governance,tensorzero}_napi.node`, `backend/engines/beads/bin/bd`,
`backend/engines/tmux/tmux`) and the embedded `backend/dist`. The frontend is the Wave-native
`recoder-*` views built into the shell — the old separate `cockpit/dist` is gone (the cockpit SPA
was deleted, recoder-flgn). The packaging-truth gate passes (lance degrades truthfully). Only
SIGNING + the human e2e run remain.

Exact minimal build (avoids the full `task package`, which `clean`s dist and
cross-compiles Windows via `zig`, which isn't installed here):
```
# from apps/desktop — prerequisites already on disk are reused
task build:tsunamiscaffold                       # the one required artifact that was missing
cd app && pnpm run build:prod                     # production electron-vite frontend build
# UNSIGNED (proves the pipeline):
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder -c electron-builder.config.cjs -p never --mac --arm64
# SIGNED (your cert):
CSC_LINK=<your-cert.p12> CSC_KEY_PASSWORD=<pw> pnpm exec electron-builder -c electron-builder.config.cjs -p never --mac --arm64
```
- Native `.node` addons + `bd` + `tmux` + `backend/dist` were already built and present;
  only `dist/tsunamiscaffold` needed building. Rebuild the `.node`
  via `scripts/build-native-addons.sh` only if stale.
- **Landmine (fixed 2026-07-22, commit `38acbade4`):** the root pnpm override
  `@xmldom/xmldom: ">=0.8.12"` floated to 0.9.9, which broke electron-builder's mac
  plist parsing (`plist@3.1.0` calls `parseFromString` with no mimeType; 0.9.x rejects
  it). Now constrained to `>=0.8.12 <0.9.0` (→ 0.8.13). If a future install re-floats
  it, packaging dies with a `DOMParser.parseFromString ... mimeType "undefined"` error.
- A clean `pnpm install` currently crashes in pnpm's bin-linking dedup (`Invalid
  Version` in `_linkBins`) — the pre-existing #22 workspace drift (a package with an
  empty `version`). The lockfile here was regenerated with `pnpm install --lockfile-only`
  (which skips bin-linking). Fixing the crash is part of task #22.
- The `beforePack` gate aborts if a REQUIRED engine artifact is missing or wrong-arch — that is intended. lance is optional (ships degraded → Qdrant).
- Then boot the `.app`, sign in, create a workspace on a real repo, confirm an agent runs in a tmux worktree, review the diff, merge. This completes task #17's "dmg boots and runs a real workspace".

## 2. Build the Lance native addon  (optional — embedded vector store)
`crates/lance/npm-bindings` **does not exist at the repo root** (only in stale worktrees). To make Lance real: vendor/create `crates/lance/npm-bindings` with its own Cargo.toml (napi + cdylib), add `build_lance()` to `scripts/build-native-addons.sh`, build release. Until then Lance degrades truthfully to Qdrant (already handled).

## 3. Bundle the Python sidecars  (optional — mem0/colbert/browser-use/ops-recorder in the dmg)
Not bundled today → those engines are dead-but-degrade-truthful in a packaged app. Bundling needs per-arch venvs or a bundled interpreter (heavy). Alternative: point `MEM0_BASE_URL` / `COLBERT_RERANK_URL` at cloud sidecars via env.

## 4. Terminal durable-shell lifecycle merge  (release gate — customer-visible terminal)
See `docs/architecture/TERMINAL-UNIFICATION.md` (Bucket B). The safe foundation (shared server, naming contract, health, read bridge) is shipped; the load-bearing merge (route the wave durable-shell block through tmux attach, retire the JobManager, collapse to one reconciler) needs owner sign-off + a **packaged-app integration test** (per `.claude/rules/production.md`). Do not run autonomously.

## 5. Auth spine — Phase A remainder  (release gate, AGENTS.md rule 3)
- Reconcile backend origin: set `RECODER_BACKEND_URL`/`BACKEND_URL` to the real Node backend port (not the stale default) or the seam silently no-ops.
- Enable `RECODER_AUTH_BACKEND_SEAM=1` in a **non-prod** env; run green: `scripts/sso-logout-matrix.sh`, `scripts/verify-auth-email-reset-e2e.sh`, `scripts/verify-cli-device-flow-e2e.sh`. Split-brain risk: ~19 route files read `getServerSession` directly.
- **Prod `users→user` backfill migration** — owner call on prod data. Backup → migrate `recoder_main` → verify counts → sso/device e2e → then delete the raw-SQL compat bridge. Migration is written; NOT run.
- **Website (`app/`) Next security pin + install — the REAL #22 blocker (diagnosed 2026-07-22).** There is a hard version triangle: `@payloadcms/next@3.81.0` only accepts next `>=15.4.11 <15.5.0 || >=16.2.0 <17.0.0`, while React2Shell (CVE-2025-55182) is only patched at `15.5.18` **or** `16.2.6`. The ONLY value satisfying both is **`next@16.2.6` + `react@19`** (Payload 3.81 + Next 16 both require React 19; `@types/react` is already `^19.2.7`, so the code is React-19-typed). The pin is now corrected to `16.2.6`/react 19 on `feat/enterprise-s0-p0`. **BUT the install itself is separately broken** and is NOT a version issue: `app/` carries `workspace:*` deps (`@recoder/auth`, `@recoder/database`, `@recoder/ui`, …) — a **pnpm/yarn protocol that `npm install` cannot resolve** (`EUNSUPPORTEDPROTOCOL`) — yet it ships a `package-lock.json` (npm) and is **NOT a pnpm-workspace member** (`pnpm-workspace.yaml` lists `apps/desktop/app`, not root `app/`). So it installs via neither `npm` (workspace: protocol) nor `pnpm` (not a member + the root pnpm install hits the `_linkBins` "Invalid Version" bin-dedup crash). **Owner decision required** (auth-critical app): either (a) add `- app` to `pnpm-workspace.yaml` + fix the `_linkBins` crash (find the dep with an empty `version` field) so `pnpm install` populates app deps, or (b) convert app/'s `workspace:*` deps to concrete versions/`file:` so `npm install` works standalone. Until then app `node_modules` has almost none of its deps (56 "cannot find module" tsc errors, all resolution-not-code). Runtime/preview verification of the 15→16 + 18→19 migration is owner-gated (no autonomous login/CMS smoke test) — verify on a preview before merging to prod. The `app/middleware.ts` `x-middleware-subrequest` guard (CVE-2025-29927) holds regardless of version.

## 6. Growth — search submission + keys  (manual owner actions)
See `docs/growth/SEARCH-SUBMISSION-RUNBOOK.md`. Code shipped: `robots.ts`, truthful `sitemap.ts`, `POST /api/indexnow` (no-op without key), GA→`NEXT_PUBLIC_GA_ID` env + verification-meta env, the payment conversion events now fire, LTV-by-channel aggregation. Owner does:
- Generate an IndexNow key (UUID), set `INDEXNOW_KEY`, deploy `/<key>.txt` (Bing consumes IndexNow automatically).
- Google Search Console: set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, submit sitemap. Bing Webmaster: claim property + submit sitemap. Brave: `search.brave.com/submit-url` (manual, no API).
- GA4: confirm/rotate `NEXT_PUBLIC_GA_ID`; mark `signup_completed` + `subscription_created` as conversions; optionally set `ANALYTICS_INGEST_URL` (the server sink LTV reads — without it LTV shows a truthful empty state, no synthetic CAC).

## 7. Preview-verify screenshot artifact store  (future — evidence retention)
The preview-verify loop is closed (verify → persist summary → GET → desktop "preview checked ✓/✗"), but the screenshot PNG is not retained (only an opaque artifactId is sealed into the audit chain). To show the screenshot inline, add a real artifact store + a `.../preview-verification/screenshot` stream route; then `screenshotRef` becomes a URL. Until then the desktop truthfully shows "screenshot not retained".

## 8. OpenShip email  (deferred — do NOT fork)
Evaluated 2026-07-21: don't fork/vendor. Re-eval in 2+ quarters only for INBOUND mail on a clean non-Hetzner VPS. See the memory note.
