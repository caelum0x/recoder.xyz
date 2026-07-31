# Recoder — Platform Status (single source of truth)

> **Updated 2026-07-25.** This file reconciles the previously-conflicting status
> docs. When any doc disagrees with this one, this one wins for the *headline*
> verdict; the linked docs hold the detail. Per repo policy: **truthful health,
> never fake success.**

## What "done" means

Per **[PRODUCT-THESIS.md](./PRODUCT-THESIS.md)** (owner-locked), Recoder is the
**self-hosted convergence layer for parallel coding agents**: run N agent CLIs
(Claude Code, Codex, Cursor, opencode…) in isolated git worktrees, then use a
shared memory fabric + a governed, human-approvable, evidence-producing **merge**
to turn many divergent runs into **one trusted, shippable change** — on infra you
own, with your keys. The terminal stays plain; governance is an in-flow gate +
exportable evidence file, not a dashboard.

The finish line is a **3-step convergence loop**:

1. Run N agents in parallel worktrees — **✅ works end-to-end.**
2. Compare / converge N diffs, shared memory informing agents — **🟢 converge engine shipped** (2026-07-25): `compare.service` surfaces contested files; the new `converge` engine resolves them (non-contested auto, contested by selection) and **composes** the winners into a fresh governed branch (`GET/POST /api/conductor/workspaces/compare/:taskGroup/converge[-plan]`) that flows through the step-3 merge + evidence. Remaining: line-level/AST synthesis when two agents edit the *same* file (currently whole-file pick).
3. Governed, evidence-producing merge as the headline artifact — **🟢 shipped**: the governed merge emits a content-hashed `ConvergenceEvidence` record (task + N candidate diffs + governance verdict/approval + verification + per-file `mode`/contributors provenance), sealed into the Merkle audit chain (`GET …/evidence`), **and a framework-mapped export pack** (`GET …/evidence/export?format=json|md`) that maps it to SOC2 CC8.1 / EU AI Act Art. 12 / DORA controls — each status **derived** from present evidence, never a fabricated "met". Viewable + downloadable from the desktop Review surface (control coverage + per-control status/reason) — **and Ed25519-signed** (env-gated `EVIDENCE_SIGNING_KEY`, self-verifying public key; the desktop panel verifies it in-app via WebCrypto and shows `✓ verified` / `signed` / `unsigned` truthfully). Remaining: cert-chain/PKI + a broader control catalog (starter set today).

## Where we are (2026-07-25)

| Area | State | Verdict |
|---|---|---|
| **Backend** (`backend/`) | ~90% | Greenfield 15-domain spine is real (old 12.8k-line monolith deleted). All 12 build phases wired; `tsc` 0 · 2,554 tests green (re-verified with the #22 install fix, 2026-07-25). `dist/` may lag until rebuilt. |
| **Desktop** (`apps/desktop`) | ~80% | Core loop (launch N agents → diff → merge) + convergence/evidence all work on arm64. Cockpit torn down. Sign-in is now optional/offline-safe, Session/Approvals/Memory fixed, **Board wired** (task-driven pick-an-issue→launch). Remaining gaps: arm64-only unsigned build, dead-by-design engines (Lance, Python sidecars), a few retired infra views still registered (OSS-name scrub). `DESKTOP-UX-STATE-AND-PLAN.md` is stale — most gaps it lists shipped after its date. |
| **Website** (`app/`) | ~90% | 110 pages + 169 API routes, live in prod. Now installs + builds cleanly from the monorepo (#22 fixed 2026-07-25 — full `next build` produces BUILD_ID + standalone). Remaining gaps: Phase A auth migration written-but-unrun, dual auth seams. |
| **Convergence thesis** | 3 of 3 shipped | Parallel worktrees ✅; converge engine ✅ (`domains/conductor/converge/` — whole-file pick or `git merge-file` 3-way synthesis); governed evidence-merge ✅ (`domains/conductor/evidence/convergence-evidence.ts` + framework-mapped export + Ed25519 signing). Remaining refinement: AST/semantic (not line-level) same-file merge. |

Detail: backend → **[RECODER-BACKEND/ARCHITECTURE.md](./RECODER-BACKEND/ARCHITECTURE.md)**,
engines → **[RECODER-BACKEND/FUSION-STATUS.md](./RECODER-BACKEND/FUSION-STATUS.md)**,
desktop/product → **[DESKTOP-UX-STATE-AND-PLAN.md](./DESKTOP-UX-STATE-AND-PLAN.md)**,
capabilities → **[RECODER-MODULES.md](./RECODER-MODULES.md)** + **[RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md)**.

## Blockers to "fully done"

1. **~~Install blocker (#22)~~ — RESOLVED 2026-07-25.** Both `backend/` and the
   website `app/` now install and build cleanly from the monorepo. `app/` was made
   a pnpm member, its `@recoder/*` deps corrected (added `ecosystem-config`, dropped
   orphan `database`/`ui`, recovered 2 UI components locally), the npm lock removed,
   and Turbopack roots pinned to the monorepo. Verified: `pnpm install` ✓,
   `prisma generate` ✓, `tsc` resolves, `next build` ✓ (BUILD_ID + `.next/standalone`).
   Backend: `tsc` 0 · 2554 tests green. The APFS pressure that used to compound this
   is clear (~14 GB free). Build-time secrets still come from the deploy env.
2. **Convergence loop — shipped end-to-end** (backend + desktop): parallel
   worktrees → **converge** (whole-file pick **or** intra-file `git merge-file`
   3-way synthesis; conflicts truthfully surface as `unresolved`/400, never a
   marker-poisoned branch) → **governed merge + exportable evidence record** (with
   per-file `mode`/contributors provenance). Usable from the desktop via a
   terminal-plain Converge panel with per-file **pick or Synthesize** — a `?probe=1`
   dry-run shows `✓ auto-mergeable` / `✗ <reason>` per contested file before
   composing. Remaining refinements: AST/semantic (not line-level) merge and an
   auto-"best" heuristic.
3. **Desktop distribution** — no signed/notarized dmg, arm64-only; Lance vector
   store + Python sidecars ship dead-by-design (owner-gated packaging Bucket B).
4. **Phase A auth consolidation** — `users → user` backfill written but unrun on
   prod; `RECODER_AUTH_BACKEND_SEAM` off; compat bridge still live. See
   **[RECODER-NEXT-PHASE.md](./RECODER-NEXT-PHASE.md)**.
5. **(closed 2026-07-25)** ~~tensorzero CLI-run inference routing~~ — now wired
   (`bootstrap/index.ts:598-601`); CLI agent tokens route through the gateway.
   Remaining tensorzero item: `feedback()` RLHF on merge/approve has no caller.

## Owner-gated (need prod access or an owner decision — do not self-run)

- Run the `users → user` auth backfill migration on `recoder_main`, then delete the compat bridge.
- Rotate `COMPOSIO_API_KEY` (was exposed in git history; code now reads env).
- Next.js `15.4.11 → 15.5.x` security bump (needs a clean install).
- Cloud-tier mesh (ziti `enroll()` / recoder-xds writes) — shipped as ready seams, endpoints withheld (single env flip).
- Desktop packaging Bucket B (x64/universal native, Lance, Python sidecars, signed dmg).

## Doc hygiene (2026-07-25 cleanup)

Removed (stale/misleading): `app/PROJECT_STATUS.txt`, `app/PHASE_6_SUMMARY.txt`,
`app/REBUILD_SUMMARY.txt`, `docs/RECODER-BACKEND/FILE-TREE.md`, `docs/ideas/*` junk.
Archived (historical/completed): `docs/archive/GAP-AUDIT.md`,
`docs/archive/BUILD-ORDER.md`. Rewrote: `backend/README.md` (was the retired
Docker backend). Corrected: FUSION-STATUS tensorzero row; `AGENTS.md` dead
capability-map link. This file is the new top-level status entry point.
