# Recoder — Owner Runbook (credential- & release-gated remainder)

Everything in this repo that can be built and verified **without owner credentials or a signed release** is done and pushed on `feat/enterprise-s0-p0`. This file is the single list of what genuinely needs your hands, each with exact steps. Nothing here was faked or half-claimed in code.

## What is already DONE + verified (context)
- Backend: all 12 OSS engines fully productized (deep-module fusion), backend-src consolidation with a **permanent cross-domain-import guard** (`backend/src/shared/__tests__/domain-boundaries.test.ts`), 2,300+ tests, tsc 0, boots 15 truthful health sources.
- Desktop: packaging fail-loud gate (arch-aware, lance-optional), env injection, truthful engine roster; cockpit terminal-plain compare-group attach + preview-checked line; the durable-shell **safe subset** (shared tmux-server invariant, `recoder-<id>` naming contract, health emits `tmuxBin`+socket, read bridge, flagged attach).
- **Packaged e2e engine layer PROVEN**: booting the backend against the real on-disk release `.node` artifacts, openfang/tensorzero/governance load in-process and the health roster is truthful (6 up, rest down/degraded honestly). The `.dmg` fail-loud gate passes against the real tree (15 required artifacts present + arm64, lance shipped-degraded).
- bd issue tracker fixed (v52-aware binary). App frontend tsc 18→0.

---

## 1. Sign & ship the desktop `.dmg`  (needs your Apple Developer cert)
The engine layer is proven-alive; only signing + the electron package run remain.
```
# from apps/desktop
task build:tsunamiscaffold        # produces app/dist/tsunamiscaffold (gate needs it)
# build backend/dist + cockpit/dist (their own build tasks) if not fresh
scripts/build-native-addons.sh    # release .node (already present; rebuild if stale) — governance|tensorzero|openfang
cd app && CSC_LINK=<your cert> CSC_KEY_PASSWORD=<pw> pnpm electron-builder --mac --arm64
```
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
- Next `15.4.11 → 15.5.x` security bump — needs `pnpm install` (app `node_modules` is drifted: has next@16.2.6 vs the pin; `@sentry/nextjs` not installed → 49 baseline tsc errors; jest harness broken via next-intl/plugin). Reconcile the install to the pin (or bump the pin) — task #22.

## 6. Growth — search submission + keys  (manual owner actions)
See `docs/growth/SEARCH-SUBMISSION-RUNBOOK.md`. Code shipped: `robots.ts`, truthful `sitemap.ts`, `POST /api/indexnow` (no-op without key), GA→`NEXT_PUBLIC_GA_ID` env + verification-meta env, the payment conversion events now fire, LTV-by-channel aggregation. Owner does:
- Generate an IndexNow key (UUID), set `INDEXNOW_KEY`, deploy `/<key>.txt` (Bing consumes IndexNow automatically).
- Google Search Console: set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, submit sitemap. Bing Webmaster: claim property + submit sitemap. Brave: `search.brave.com/submit-url` (manual, no API).
- GA4: confirm/rotate `NEXT_PUBLIC_GA_ID`; mark `signup_completed` + `subscription_created` as conversions; optionally set `ANALYTICS_INGEST_URL` (the server sink LTV reads — without it LTV shows a truthful empty state, no synthetic CAC).

## 7. Preview-verify screenshot artifact store  (future — evidence retention)
The preview-verify loop is closed (verify → persist summary → GET → cockpit "preview checked ✓/✗"), but the screenshot PNG is not retained (only an opaque artifactId is sealed into the audit chain). To show the screenshot inline, add a real artifact store + a `.../preview-verification/screenshot` stream route; then `screenshotRef` becomes a URL. Until then the cockpit truthfully shows "screenshot not retained".

## 8. OpenShip email  (deferred — do NOT fork)
Evaluated 2026-07-21: don't fork/vendor. Re-eval in 2+ quarters only for INBOUND mail on a clean non-Hetzner VPS. See the memory note.
