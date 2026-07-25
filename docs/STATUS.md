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
2. Compare / converge N diffs, shared memory informing agents — **🟡 partial.**
3. Governed, evidence-producing merge as the headline artifact — **🔴 not yet the shipped artifact.**

## Where we are (2026-07-25)

| Area | State | Verdict |
|---|---|---|
| **Backend** (`backend/`) | ~90% | Greenfield 15-domain spine is real (old 12.8k-line monolith deleted). All 12 build phases wired; ~1,462 tests green **per docs** — not re-verified locally yet (see #22). `dist/` is stale. |
| **Desktop** (`apps/desktop`) | ~70% | Core loop (launch N agents → diff → merge) works on arm64. Cockpit torn down. Gaps: arm64-only unsigned build, dead-by-design engines (Lance, Python sidecars), sign-in UI half-wired, Board/Session fragile. |
| **Website** (`app/`) | ~85% | 110 pages + 169 API routes, live in prod. Gaps: no clean fresh install/build (#22), Phase A auth migration written-but-unrun, dual auth seams. |
| **Convergence thesis** | step 1 of 3 | Parallel worktrees done; compare/converge partial; governed evidence-merge not yet shipped. |

Detail: backend → **[RECODER-BACKEND/BUILD-STATUS.md](./RECODER-BACKEND/BUILD-STATUS.md)**,
engines → **[RECODER-BACKEND/FUSION-STATUS.md](./RECODER-BACKEND/FUSION-STATUS.md)**,
desktop/product → **[DESKTOP-UX-STATE-AND-PLAN.md](./DESKTOP-UX-STATE-AND-PLAN.md)**,
capabilities → **[RECODER-MODULES.md](./RECODER-MODULES.md)** + **[RECODER-ARCHITECTURE.md](./RECODER-ARCHITECTURE.md)**.

## Blockers to "fully done"

1. **Install blocker (#22)** — `app/` and `backend/` can't do a clean reproducible
   install (`workspace:*` deps + `app/` not a pnpm member + npm lock missing those
   deps). Prod works only via hand-carried prebuilt `.next`/`dist`. This blocks
   independent verification of every "green" claim. *(APFS disk pressure that used
   to compound this is currently clear — ~14 GB free.)*
2. **Convergence step 2→3** — compare/synthesize → governed evidence-producing
   merge is the differentiator and is still partial.
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
