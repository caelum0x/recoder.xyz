# Recoder — TODO (mirrors docs/PLAN.md, 2026-08-07)

Source of truth for *why/priority* is [docs/PLAN.md](../docs/PLAN.md); issue truth is
`bd`. This is the actionable checklist. Check items off only with a verification
artifact (test / script / live check). Do not fake done.

## Now shipped + live (context — do not re-do)
- [x] Product loop end-to-end: fan N agents → mid-run comms + shared memory → N-up
      compare → assisted synthesize → governed evidence-backed merge → resolved-cluster.
- [x] Desktop **v0.16.1** signed + notarized + published (`dl.recoder.xyz`, `/download` public); auto-update on.
- [x] Part II roadmap: **17/18 phases DONE** (A1–A6, B1–B6, C1–C5); only C6 billing owner-gated.
- [x] Docs reconciled to reality (OWNER-RUNBOOK, SECURITY-POSTURE, NEXT-PHASES, and the docs-tree accuracy pass).

## Track A — Go-live gates (OWNER-gated)
- [ ] **Prod website deploy** behind shipped positioning + cli-auth — `recoder-qtac` (approval-gated).
- [x] **Canonical trunk** — `recoder-mhyt`: reconciled release line fast-forwarded to `main` at `ffbda52cb` on 2026-08-31.
- [x] **Billing cutover to Dodo** — `recoder-t24j` (C6): LIVE 2026-10-21. Reused the real live Dodo API key from the `bus_EKm0SScXc8Tpc3ZDoTbnn` business (recoder's own `.env`/`app.env.local` `DODO_API_KEY_LIVE` was a literal `your_live_api_key_here` placeholder). Created 5 real live Dodo products via API (`DODO_PRODUCT_WEEKLY=pdt_0NqE9bKkKflhwYZas6yF2`, `_MONTHLY=pdt_0NqE9bNmRK4ZuRpisLv4o`, `_PRO=pdt_0NqE9bQAVuGZRLWbtlEdW`, `_PRO_ANNUAL=pdt_0NqE9bSm9u9tBLOI5xIMY`, `_TEAM=pdt_0NqE9bXishCljektXbJQn`, prices from `app/lib/pricing-config.ts`), registered a real live webhook endpoint (`ep_3L0eElSCHnxNsth2aIBRdObJJzT` → `https://recoder.xyz/api/webhooks/dodo`) and pulled its real `whsec_` secret. Wired `DODO_PAYMENTS_API_KEY`/`DODO_WEBHOOK_SECRET`/`DODO_PRODUCT_*` into `/opt/recoder/app.env.local` on `recoder-micro` (92.5.156.133) and restarted `pm2` with the env actually sourced (plain `--update-env` does NOT re-read the file — PM2 caches the snapshot from original start; had to `source app.env.local` in the restart shell). Verified live: `curl https://recoder.xyz/api/health` → `billing.dodo: {configured:true, webhookConfigured:true, checkoutConfigured:true}`, `activeProvider:"dodo"`; unauth checkout → `401` (was `502` mid-restart, now clean); webhook endpoint with a bogus signature → `401 Invalid signature` (was `503`/no-op before the 2026-10-21 signature fix, commit `979cfbe99b`). `pm2 save`d so the new env survives a reboot. Enterprise stays contact-sales (no Dodo product — `price:0` custom).
- [ ] **Free-tier inference policy** decision — `recoder-bb1n` `[OWNER]`.
- [x] **Prod-box integrity resolution** — `recoder-5iqy`: v3 monitor glob identified as root cause, v4 corrected, coreutils restored, and `dpkg -V` clean; bead closed 2026-08-17.
- [x] **License resolution** — `recoder-rxn0` (P1): confirmed 2026-10-21 — `apps/desktop/app/build/assert-license-boundary.cjs` already fail-closes packaging on both `recodergit` (PolyForm-Noncommercial) and `multica` (restricted/modified Apache-2.0): `RestrictedEngines`/`ForbiddenPathPatterns`/`ForbiddenContentMarkers` cover `server/engines/multica` and its `github.com/multica-ai/multica/server` Go module string, wired into `electron-builder.config.cjs`'s `beforePack`/`afterPack` hooks (rejects packaging inputs that cross the restricted source, then scans the final artifact tree for the forbidden markers). Ran the real test suite: `tests/assert-license-boundary.test.ts` + `tests/packaging-config.test.ts`, both green, 18/18 tests passed.
- [ ] **Re-enable minimal green CI** — `recoder-a7ut` (P0): 33 workflows disabled; test + secret-scan per PR.

## Track B — Deepen the moat (ENGINEERING; start now, no owner needed)
- [ ] **Convergence AST/line-level merge synthesis** for same-file edits — `recoder-8ti9`. *The moat core.* TDD vs real divergent runs.
- [ ] **Diff-review depth**: adopt `@pierre/diffs` in the compare/merge surface — `recoder-p8f3`; finish accept/reject ergonomics.
- [ ] **Split `@recoder/auth`** so the embedded backend stops shipping Next/React — `recoder-sxmn` (shrinks DMG, eases signing).
- [ ] **DT-7 desktop resilience** — `recoder-480i/4wdp/lyzr/ku6l`: backend-url bridge, reconnect/replay, stale-gate, device-auth refresh. (Unblocks the v0.16 "kill → relaunch → state intact" gate.)
- [ ] **Missing desktop surfaces** — Conversation view `recoder-qj83`; Dashboard tabs `recoder-j8i4`; ask-the-repo `recoder-qd5i`.
- [ ] **Widen reach** — x64 + universal mac build `recoder-55v9`; bundle Python sidecars `recoder-b8ol`.

## Gates (verify, don't assert)
- [ ] **v0.16 release gate:** cold machine → sign in → detect → parallel launch → kill app → relaunch → state intact → converge → merge. (Blocked on DT-7 + a human e2e boot of the live dmg.)
- [ ] **v0.17 convergence gate:** 3-agent task where assisted converge beats hand-merging on wall-clock, ending in an exported evidence file.

## Then
- [ ] Instrument the funnel: download → first-open → sign-in → first parallel launch → **first converge (aha)** → first merge → D7. North-star: weekly converged merges / active user.
- [ ] Attack distribution (the #1 risk): dev-loved, self-serve, <10-min aha on-ramp.
