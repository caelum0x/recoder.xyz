# Recoder - Historical Plan Snapshot (2026-08-07)

> **Superseded for active sequencing on 2026-08-15:** the invite-only BYOK plan is
> [RECODER-PRIVATE-BETA-PLAN.md](./RECODER-PRIVATE-BETA-PLAN.md), backed by the
> [full product spec](./RECODER-FULL-PRODUCT-SPEC.md),
> [connection architecture](./RECODER-CONNECTION-ARCHITECTURE.md), and
> [open-bead map](./OPEN-BEADS.md). This file remains historical evidence for the
> convergence strategy and previously shipped slices.

> Historical status recorded on 2026-08-07. The then-current strategy and per-seam
> technical roadmap lived in
> [NEXT-PHASES.md](./NEXT-PHASES.md), the locked strategy in
> [PRODUCT-THESIS.md](./PRODUCT-THESIS.md), and the release/credential remainder in
> [OWNER-RUNBOOK.md](./OWNER-RUNBOOK.md). Nothing here is asserted without evidence
> (commit / bd id / file:line). Truthful status only — no inferred success.

## The one line

**Recoder is the merge button for the multi-agent era** — the terminal IDE where a
dev runs any coding agent (Claude Code, Codex, Cursor, opencode, pi) across parallel
isolated git worktrees, then converges the divergent runs into **one reviewed,
memory-informed, evidence-backed merge**. Convergence is the wedge; the plain
terminal is the surface; governance ships as an in-flow gate + exportable evidence
pack, never a dashboard. (PRODUCT-THESIS.md:13-20, NEXT-PHASES.md:14-30)

---

## 0. Where we are (2026-08-07) — honest state

**Historical 2026-08-07 claim:** the product loop was described as shipped and the
app as live. Desktop **v0.16.1** was
signed + notarized (Accepted) + stapled + published to `dl.recoder.xyz`
(`latest-mac.yml=0.16.1`, `/download` public); existing installs auto-update
(bd `recoder-ahxt`, `recoder-fjod` closed). The end-to-end convergence flow —
fan N agents → they talk mid-run and share memory → N-up compare → assisted
synthesize → governed, evidence-producing merge → clear the losers — is proven
end-to-end (commit `5078e82f9`).

**Historical 2026-08-07 claim:** the technical roadmap was described as essentially
done. Of the 18 Part-II phases in
NEXT-PHASES, **17 are DONE and 1 (C6 billing unification) is owner-gated** —
re-verified against code, not asserted (see §2). The last two shipping waves were
*clarity* (calmer desktop, keyboard board nav, at-a-glance divergence summary,
resolved-cluster) not new surfaces.

**So the honest gap is not "more features." It is two things:**
1. **The moat is still shallow.** We have the convergence *loop*; we do not yet
   have deep convergence *intelligence* (line-level / AST merge synthesis for
   same-file edits) or the accumulated evidence-backed memory that becomes a
   system-of-record. That depth is the only compounding moat (PRODUCT-THESIS.md:147-160).
2. **Go-live is owner-gated and distribution is unsolved.** Prod website is behind
   the shipped positioning; billing isn't cut over; the prod box has an open P0
   integrity finding; there's no canonical trunk or green CI. And distribution —
   the real risk — is unaddressed (Conductor/Warp have funnels + capital; we have
   the sharper wedge and no channel). (PRODUCT-THESIS.md:156-160)

**North-star metric:** weekly converged merges per active user. **Product bar:** a
first-time user fans one task to 3 agents and reaches one merged, evidence-backed
branch in under 10 minutes without reading docs (NEXT-PHASES.md:34-36).

---

## 1. What is shipped (the loop, end-to-end) — evidence

| Capability | Evidence |
|---|---|
| Run any agent CLI in parallel isolated worktrees; guided first-run | `401fb31cc`, `1ecfe8644` |
| **Mid-run agent communication** (siblings steer each other, stop duplicating) | bd `recoder-i499`; `b6b88407c`, `9a0fd4fb3` |
| **Shared team memory** across runs (the moat, v1) | `16397e496`; changelog v0.16.0 |
| N-up compare + **assisted synthesize / merge** (was inert → live) | `9a0fd4fb3`, `a5576a51e` |
| **Ad-hoc converge** + completion→converge nudge (the hero flow) | `17fc4ccc6`, `cc81949ab`, `2910403e5` |
| **End-to-end convergence proof** (N runs → one merge) | `5078e82f9` |
| Run screen: inline approval, durable git-tag checkpoints, PR path, conflict early-warning | `e5d5e7984`, `eba416364` |
| Keyboard-first board nav; at-a-glance divergence summary; resolved-cluster | `d5d2b9671`, `d194b1c32`, `abbe42bc1` |
| Sign in with GitHub / Google / **Apple**; calmer de-crowded desktop | `88e540aa0`, `3e642a87c` |
| Auto-updater default-ON + truthful changelog; **v0.16.1 published live** | `928a376a3`, `ec58818f3`, `0790c0b3e` |
| Terminal-IDE positioning realigned across site + app | `dd00862a3`, `23c8843bf` |
| Creem billing provider + CLI entitlements; public-route abuse hardening | `235daf394`, `a8c60fa65` |

---

## 2. Phase status (Part II, re-verified against code)

`DONE` = verified in code, not just claimed in the doc.

- **Desktop A1–A6:** all **DONE** — updater opt-out (`updater-core.ts:7-8`),
  first-run foregrounding (`recoder.tsx:842`), BYOK key screen
  (`recoder-settings.tsx:109-138`), N-up compare (`compare.routes.ts:300`),
  converge discoverability (`recoder.tsx:26,197`), file/hunk discard (`recoder-diff.tsx:226`).
- **Backend B1–B6:** all **DONE** — SQLite state-of-record
  (`sqlite-agent-os.repository.ts`), verified opencode/cursor launchers
  (`runtime-specs.ts:48-55`), assisted synthesize (`converge.ops.ts`), cross-sibling
  shared memory (`sibling-awareness.adapter.ts`), evidence-pack export
  (`conductor-module.ts:996`), conductor split (3,580→1,202 lines).
- **Website C1–C5:** all **DONE** — device-flow consolidated (Set B gone),
  entitlement endpoint (`cli/entitlements/route.ts`), account plane
  (`account/page.tsx`), shared auth factory (`create-recoder-auth.ts`), OAuth-only true.
- **C6 Billing unification:** **OWNER-GATED** — `PaymentProvider` interface +
  Creem adapter exist; cutover needs the Creem key + one enforcing path.

**Implication:** stop treating NEXT-PHASES as a build backlog. The build is done;
the work is *depth* (§3 Track B) and *go-live* (§3 Track A).

---

## 3. The real next work — two tracks

### Track A — Go-live gates (OWNER-gated; unblock distribution)

Ordered by what blocks a trustworthy public launch. Each needs owner
credentials/authority; none is a code gap.

1. **Prod website deploy** (bd `recoder-qtac`) — prod is behind the shipped
   convergence positioning + cli-auth identity. Approval-gated deploy.
2. **Canonical trunk** (bd `recoder-mhyt`) — `origin/main` is frozen ~2 months and
   ~552-conflict-diverged from `feat/enterprise-s0-p0`. No repeatable release until
   one branch is authoritative. Owner call: promote the shipped branch or hand-drive.
3. **Billing cutover to Creem** (bd `recoder-t24j`, C6) — wire the approved Creem
   key + one enforcing webhook path; rotate after. Also decide the free-tier
   inference policy (bd `recoder-bb1n`, `[OWNER]`).
4. ~~**Prod-box security remediation** (bd `recoder-5iqy`)~~ — **closed
   2026-08-17**. The v3 miner-monitor glob deleted genuine coreutils; v4 corrected
   the match, coreutils was restored, and `dpkg -V` was clean. No host compromise.
5. **License resolution** (bd `recoder-rxn0`, P1) — recodergit (PolyForm-Noncommercial)
   is already **un-bundled** from the DMG (`electron-builder.config.cjs` comment);
   confirm `multica` (restricted-Apache) does not ship in the Go server binary.
6. **Re-enable a minimal green CI** (bd `recoder-a7ut`) — 33 workflows are in
   `.github/workflows.disabled`; test + secret-scan on every PR before opening up.

### Track B — Deepen the moat (ENGINEERING; not owner-gated — do now)

This is where the compounding advantage is built. Priority order:

1. **Convergence intelligence — line-level / AST merge synthesis** (bd `recoder-8ti9`)
   — the hard core of the wedge: when siblings edit the *same file*, synthesize a
   merge at hunk/symbol granularity instead of pick-one-branch. This is the single
   most moat-relevant piece of engineering left. TDD it against real divergent runs.
2. **Diff-review depth** — adopt/port battle-tested OSS into the review surface
   (bd `recoder-p8f3` `@pierre/diffs`) so the compare/merge screen is best-in-class,
   and finish accept/reject ergonomics.
3. **Auth-package split** (bd `recoder-sxmn`) — split `@recoder/auth` so the embedded
   backend stops shipping Next/React. Shrinks the DMG and removes the signing EMFILE
   pressure — a direct win for the release pipeline.
4. **Desktop resilience (DT-7 cluster)** (bd `recoder-480i/4wdp/lyzr/ku6l`) —
   backend-url bridge, reconnect/replay, stale-gate, main-process device-auth
   refresh. Makes "kill the app → relaunch → everything still there" true (the v0.16 gate).
5. **Missing/stubbed desktop surfaces** — Conversation view (bd `recoder-qj83`),
   Dashboard tabs (bd `recoder-j8i4`), ask-the-repo intel (bd `recoder-qd5i`).
6. **Broaden the top of funnel** — x64 + universal mac build (bd `recoder-55v9`) and
   Python sidecar bundling (bd `recoder-b8ol`); macOS-arm64-only caps reach.

---

## 4. Sequence (dependency-honest)

- **Immediately, in parallel (no owner needed):** Track B #1 (convergence AST merge —
  the moat), #3 (auth split — unblocks a leaner signed build), #4 (DT-7 resilience).
- **Owner, unblock launch:** Track A #1 (prod deploy) + #2 (trunk) first — everything
  repeatable depends on a canonical trunk + a live, correctly-positioned site.
  Then #3 (billing), #4 (prod-box P0 — do before opening to users), #6 (CI).
- **After the moat deepens + go-live gates clear:** x64/universal build (#6 Track B)
  to widen reach, then instrument the funnel (download→…→first converge→D7) and turn
  to distribution.

## 5. Gates (verified, not asserted)

- **Release gate (v0.16, still open):** cold machine → sign in → detect → parallel
  launch → **kill the app → relaunch → everything still there** → converge → merge.
  Blocked only by Track B #4 (DT-7 resilience) + a human e2e boot of the live dmg.
- **Convergence gate (v0.17):** a 3-agent task where **assisted converge beats
  hand-merging on wall-clock**, ending in an exported evidence file (the demo).
- **Every change:** at least one verification artifact (targeted test / deterministic
  script / reproducible runtime check). Do not mark done without it.

## 6. Top risks

1. **Distribution (the #1 risk).** The wedge is sharp but we have no channel.
   Mitigation: the convergence on-ramp must be a dev-loved, self-serve, <10-min aha —
   not feature parity. This is a product/marketing problem, not a code problem.
2. **Moat thinness.** No single piece is defensible today; only accumulated
   evidence-backed governed memory compounds (year-3 switching cost). Track B #1/#2
   is how we start earning it.
3. **Owner-gated go-live stall.** Trunk, prod deploy, billing, prod-box P0, secret
   rotation all need owner hands; the engineering can't route around them.
4. **Single-machine release fragility.** Local-disk + Full-Disk-Access + notarize
   quirks make releases brittle (see OWNER-RUNBOOK §1). Auth-split (Track B #3) +
   x64 build + eventual CI reduce this.

## 7. How we work

- **Recoder is the control plane; agents are runtimes.** Prefer task specs, skills,
  hooks, and verification over long prompt chains (AGENTS.md).
- **beads is the memory.** `bd ready` before starting; claim atomically; link
  discovered work `--deps discovered-from:<id>`; note evidence on the issue.
- **Workflows + verify-first.** Fan out read-heavy investigation to subagents;
  adversarially verify findings before acting; keep sensitive writes controlled.
- **Truthful health always.** Never imply success without evidence; if a gate is
  blocked, say so and file/point to the bd issue.
