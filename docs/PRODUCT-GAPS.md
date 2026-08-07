# Recoder Desktop — Product Gaps & Product-First Roadmap

Status: 2026-08-05. Owner directive: focus on PRODUCT, grounded in the canon
([RECODER-PRODUCT-DESIGN.md](./RECODER-PRODUCT-DESIGN.md),
[DESIGN-REFERENCE.md](./DESIGN-REFERENCE.md),
[PRODUCT-THESIS.md](./PRODUCT-THESIS.md) §11-13). Source: a full product-surface
audit of every `recoder-*` view against the three-screens design.

## The verdict

**The convergence engine is real, differentiated, and truthful — but the SEAT
is cramped.** The capability (fan-out → compare → converge → merge → evidence →
memory) all exists and degrades honestly; a passing e2e proves the loop. What
hurts a first-time dev is *staging*, not capability:

- The headline feature (converge) is a **five-panel stack jammed into an
  expanded board row** with sideways-scrolling columns — the differentiator has
  the least room to breathe.
- Converge is **hard-gated to same-`taskGroup` fan-out** — a dev who ran Claude
  and Codex *separately* on one repo gets **no converge path at all**, which is
  exactly how many first-timers arrive.
- The **winner-picker is shown twice** (ContestedStrip + ConvergePanel) over one
  shared selection.
- Small calm-design breaks pile up (3-color health dot, per-view color, wordmark
  headers, an emoji, a separate Approvals tab that contradicts inline-only, and
  two engine leaks that name `bd`/"engine blocks" to users).

Fixing the convergence *seat* moves the needle most; none of it needs a rewrite
of the (solid) logic modules.

## The three screens — current grades

- **Board (home): B−** — feature-complete but renders recency buckets, not the
  promised lifecycle columns; can't scan "which agent needs review."
- **Workspace detail: C** — scattered across disconnected Wave blocks (Session /
  Review / real tmux terminal are separate `createBlock` targets); no tabbed
  container. Inline approval is correct; the standalone Approvals tab was retired
  (approvals now surface inline on the diff/session stream).
- **Minimal chrome: C−** — no cube logo / workspace switcher; the health dot is now
  a single quiet graphite dot (the emerald/amber/red trio was retired); settings is
  palette-launched, not behind the avatar.
- **Zero-config first-run: B+** — the strongest area; detection + install-loop
  have no dead ends. Sign-in is (deliberately) reframed as optional.

## Roadmap — product waves (highest first-timer leverage first)

### PW1 — The convergence seat (the headline)
1. **Ungate converge** — let a dev SELECT 2+ compatible workspaces (same repo,
   shared base) launched *separately* and form an ad-hoc converge group, not
   only same-`taskGroup` siblings. Backend: a compare/converge over an explicit
   workspaceId set. This is the biggest first-timer unblock.
2. **Give converge its own uncluttered surface** — lift compare/converge out of
   the expanded board row into a dedicated view/modal with room; N columns that
   read cleanly.
3. **One winner-picker, not two** — collapse ContestedStrip + ConvergePanel into
   a single per-file decision surface over the shared selection.

### PW2 — Calm chrome & truthful invisibility (DESIGN-REFERENCE conformance)
4. **One quiet health dot** — graphite + at most one muted crimson (down); retire
   the emerald/amber/red trio and fold the connection badge in. (Corrects the
   wave-12 dot.)
5. **Inline approvals only** — retire the standalone Approvals tab + its palette
   command; keep the correct inline cards.
6. **Kill the engine leaks** — `recoder-board.tsx` naming the `bd` CLI, settings
   "engine blocks" copy → human language or removal (invisible-engines contract).
7. **Terminal/Diff design-system alignment** — shared tokens (focus-visible ring,
   `border-white/8`), no wordmark headers ("Recoder Session"/"Recoder — Review"),
   no emoji/colored FA glyphs, 400-500 weights.

### PW3 — Workspace-detail container + board shape
8. **Lifecycle columns** on the board (queued → running → needs-review → done),
   not recency buckets — the exact scan a converging dev needs.
9. **A workspace-detail container** — bring Session / Diff / (real) Terminal /
   Conversation under one tabbed surface per workspace instead of loose blocks.
10. **Settings behind the avatar**; a minimal orienting chrome (where am I /
    whose repo / switch workspace).

## Locked constraints (do not violate)
- Terminal-plain, less-is-more; engines stay invisible.
- Truthful degrade everywhere (the app already never fakes success — preserve).
- One accent (graphite + one muted crimson); no green/blue for state.
- No rewrite of the logic modules — they're solid; this is staging + chrome.
