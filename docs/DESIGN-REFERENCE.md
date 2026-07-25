# Recoder Design Reference — Cursor-grade polish, graphite/terminal-plain

Status: 2026-07-25. Web-researched (Cursor editor, Linear, OpenCode terminal DS)
and reconciled with our hard constraints: **terminal-plain, no infra dashboards,
graphite-only (no green/blue smuggled in for state), depth from borders not
shadows.** Every implementation/polish round should follow this.

Load-bearing references: **OpenCode terminal DS** (warm-dark, mono, *zero shadows*,
depth from borders only) and **Linear** (near-black, opacity-driven hierarchy, one
restrained accent). NOT Cursor's marketing site (cream/orange) — its *editor* is
neutral-dark with a blue accent; we adopt its interaction model, not its palette.

---

## 1. Visual system — the graphite darken-ladder
Darken zones for depth (don't lighten). `bg-accent` graphite is the TOP (selected/
active), not the canvas.

| role | value | use |
|---|---|---|
| bg-base | `#0e0f11` | app canvas, terminal |
| bg-panel | `#16181c` | side lists, panels |
| bg-elevated | `#1e2126` | popovers, palette, cards |
| bg-accent (existing) | `#464b56` (rgb 70,75,86) | selected row / active only |
| border-border | `rgba(255,255,255,0.08)` | hairline separators |
| border-strong | `rgba(255,255,255,0.12)` | hover/focus borders |
| text-primary | `#e6e7ea` (~90%) | values |
| text-secondary | `rgba(255,255,255,0.60)` | labels |
| text-meta | `rgba(255,255,255,0.40)` | timestamps, counts |

Rules (highest leverage first):
- **Depth from 1px borders + background steps ONLY. No drop shadows** on terminal-
  plain surfaces. One soft shadow allowed *only* on floating overlays (palette/menu).
- **Hierarchy by opacity, not three greys** — the 90/60/40 ramp is the whole system.
- **Weights 400–500, `tracking-tight`.** Never `font-bold` for hierarchy (use size/opacity).
- **Small radii** (`rounded-sm`/`rounded-md`, 4–6px). Big radii read "consumer app."
- **Strict 4px grid** (4/8/12/16/20/24/32/48). Inconsistent spacing is the #1 cheapness tell.
- Accent restraint: graphite-only means state can't rely on hue — use **luminance + weight**.

## 2. Micro-interactions
- Timings in the **120–220ms** band; hover **150ms ease-out**. Standardize easing
  `cubic-bezier(0.2,0,0,1)`. `.recoder-enter` (180ms) is already correct.
- Hover on rows/buttons: transition `background-color,border-color` 150ms; step bg
  one rung up + border→`border-strong`. **No transform/shadow** on hover.
- **`:focus-visible` = keyboard-only ring:** `focus-visible:outline focus-visible:outline-1
  focus-visible:-outline-offset-1 focus-visible:outline-white/50`. Mouse selection uses
  `bg-accent` fill, NOT the ring.
- Three-state row ladder by luminance: rest / hover(one rung up) / selected(`bg-accent`).
- Honor `prefers-reduced-motion` globally.
- **Do NOT animate** streaming agent tokens, terminal output, diff rendering, or list
  reorders on data change — fade only on panel mount/dismiss.

## 3. Empty / loading / error
- **Skeletons** for known-shape lists (flat `bg-panel` bars at real row height, one
  low-contrast shimmer, static under reduced-motion). **Spinners** only for indeterminate.
- **Empty = teach + next action** with the shortcut inline (e.g. "No workspaces yet —
  press ⌘N to launch an agent"). No illustrations.
- **Agent working = truthful streaming + a small status label** ("running/comparing/
  merging"), never a spinner. Matches "never imply success without evidence."
- **Errors quiet + specific:** `text-secondary` body + a small desaturated marker
  (dot/left-border, not a red banner). State what failed + the next lever.

## 4. Command palette + keyboard-first (⌘P)
- Floating `bg-elevated` panel (the one permitted soft shadow), hairline border, small
  radius. **Auto-focus input**, subsequence fuzzy match, ↑/↓ wrap, Enter runs, Esc closes.
- **Right-align a shortcut chip** per row (`text-meta`, mono); "Recently used" on top.
- **Teach shortcuts inline everywhere** (empty states, buttons show their key) — biggest
  "feels fast/pro" signal, free discoverability.
- Palette fades via `.recoder-enter`; row highlight is **instant** (perceived speed).

## 5. Density + hierarchy
- **Three-tier text ramp does the work:** value=primary(90%), label=secondary(60%),
  meta=meta(40%). A dense row carries 5–6 fields with no dividers.
- Prefer **text labels**; monochrome icons (currentColor, reduced opacity) only where
  meaning is instant (status dot, chevron, branch). Never icon-only for destructive.
- **One compact row height** (28–32px), never varied.
- **Numbers/IDs/paths in `font-mono`**, prose in sans — the split is itself hierarchy +
  reinforces terminal identity.

## 6. Agent / diff / review (our core surface)
Adopt Cursor 2.0's *interaction model*, reject its agent-dashboard chrome.
- **Batched, reviewable diffs** — present a completed agent's full change set together;
  **accept/reject at set / file / hunk**. (Users punish tools that remove this.)
- **Apply = single squashed commit; Reject = discard worktree+branch.** Surface truthfully.
- **Overlap/conflict pre-merge surface** — Recoder already has the "contested overlap
  set" (commit b95d5eda0). This is the gap Cursor reviewers complain about → our
  genuine differentiator. Lean in.
- Live agent status as a **list** (label + monochrome dot + streaming tail), j/k navigable
  — not a card grid of agent avatars.

### Diffs without green (the sharpest constraint)
Encode change WITHOUT relying on color perception; validate WCAG contrast:
1. **(recommended) luminance + gutter glyph:** added = slightly lighter graphite bg + `+`
   gutter; removed = darker graphite bg + `-` gutter + reduced text opacity; subtle left-border bar.
2. reserve exactly one muted crimson for **removed/destructive only** (tiny gutter bar).
3. full graphite, symbols only (cleanest, weakest scan — needs strong luminance separation).

### State without green/amber/red
Luminance + text label + monochrome glyph: ● running (dim pulse), ✓ done (full white),
✕ failed (single desaturated-red dot max). Reserve at most one muted crimson for error/
destructive; everything else graphite.

---

## Priority order (quality-per-risk)
1. Three-tier opacity text ramp + strict 4px grid + hairline borders, no shadows (§1/§5).
2. `:focus-visible` keyboard-only ring + luminance hover/selected ladder (§2).
3. Command palette (⌘P) auto-focus/fuzzy/right-aligned chips + inline shortcut hints (§4).
4. Batched accept/reject diffs (set/file/hunk) + single-commit apply / discard worktree (§6).
5. Skeleton loaders; teaching empty states; quiet specific errors (§3).
6. Overlap/conflict pre-merge surface (§6) — the differentiator.

Guardrails: graphite-only (no blue/green for state), one shadow only on overlays, no
motion on streaming/diff/terminal, list-shaped terminal-plain, adopt Cursor's model not
its dashboard.
