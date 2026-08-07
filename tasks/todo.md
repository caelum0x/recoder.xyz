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
- [ ] **Canonical trunk** — `recoder-mhyt` (P0): promote `feat/enterprise-s0-p0` or hand-drive; no repeatable release without it.
- [ ] **Billing cutover to Creem** — `recoder-t24j` (C6): wire approved key + one enforcing webhook path; rotate after.
- [ ] **Free-tier inference policy** decision — `recoder-bb1n` `[OWNER]`.
- [ ] **Prod-box security remediation** — `recoder-5iqy` (**P0**): reinstall coreutils, rootkit check, rotate secrets.
- [ ] **License resolution** — `recoder-rxn0` (P1): recodergit already un-bundled; confirm `multica` not in the Go binary.
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
