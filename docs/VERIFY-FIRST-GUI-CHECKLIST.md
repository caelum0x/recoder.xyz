# Verify-First GUI Checklist

> Status: 2026-08-11. These items have their **code shipped and unit-verified**
> (headless), but the payoff proof is a **live Electron render** that cannot run
> headlessly. This runbook is the one GUI boot pass that closes them together.
> Grounded in the graph-engineering pass (bd `recoder-480i/lyzr/4wdp/ku6l/4keq/uou2/p8f3/j8i4`)
> and the two features shipped this session (`recoder-qj83`, `recoder-qd5i`).

## Launch (arm64 dev, fast path)

From `apps/desktop`:

```bash
cd apps/desktop
task electron:quickdev      # arm64-only, no docsite/wsh — fastest boot
# or the full dev server with hot reload:
task electron:dev           # alias: task dev
```

Notes:
- `WAVETERM_ENVFILE` = repo-root `.env`; solo/DB-less runs use `RECODER_SOLO_MODE`
  (backend on `:3100`). Confirm the backend came up before exercising the UI.
- Capture evidence per item: a screenshot + the observed vs expected line. File
  results back on the matching bd issue with `bd note <id> "<evidence>"`, then
  `bd close <id>` only when the expected result is observed.

## Batch A — DT-7 desktop resilience (`recoder-480i` parent; `lyzr`, `4wdp`, `ku6l`)

Verify once at the parent boot; close all four with shared evidence.

- [ ] **`4wdp` — backend-port adoption.** Occupy `:3100` before launch (run a
  dummy listener), boot the app. **Expect:** the renderer discovers the reassigned
  backend port via the `recoder:get-backend-url` IPC and connects — no "backend
  unreachable" state. (code: `emain-ipc.ts` sync handler, `emain-backend.ts` onReady broadcast.)
- [ ] **`lyzr` / `480i` — WS reconnect + `?since=` replay.** Open a running
  workspace's Session view, kill the backend socket (or toggle network), restore.
  **Expect:** the stream reconnects and replays missed frames via `?since=` with
  no duplicated turns; a **stale badge** appears while disconnected and clears on
  reconnect.
- [ ] **`ku6l` — device-auth session refresh.** With a signed-in session near
  token expiry, leave the app idle past the refresh threshold. **Expect:** the
  main-process refresh path renews the session silently (no forced re-login), and
  a refresh failure surfaces truthfully rather than hanging.

## Batch B — new product surfaces shipped this session (render residual)

- [ ] **`qj83` — Conversation surface.** Open a workspace that has a Claude
  session on disk, switch to the Session/Conversation view. **Expect:** prior
  transcript **history hydrates** from the durable read edge, then live frames
  append below with no overlap. A workspace with **no** session file shows the
  calm empty state (never a fabricated history).
- [ ] **`qd5i` — "ask the repo" codebase view.** Open the `recoder-codebase`
  block. **Expect:** with retrieval unconfigured / recodergit disabled, both
  panels show truthful "repo not indexed" / "code graph unavailable" notices —
  **no fake hits**. (Known: `symbol_search` needs a `repoId` not yet plumbed from
  the terminal, so code-intel degrades truthfully until repo-indexing selection
  is wired — that is expected, not a bug.)

## Batch C — board / dashboard / merge surfaces

- [ ] **`4keq` — squad-autopilot + PR-review.** Start a background-agents squad;
  confirm the **budget cap** and **kill-switch** halt the squad, and the PR-review
  surface renders. (Backend guardrails are unit-tested; this proves the board wiring.)
- [ ] **`uou2` — start workspace from a bd issue.** From the board, pick a bd
  issue and launch a workspace. **Expect:** `issue.id → taskId` plumbs through and,
  on merge, the issue is closed/linked.
- [ ] **`p8f3` — diff renderer (`@pierre/diffs`).** Open a diff/compare view.
  **Expect:** syntax-aware N-up rendering on the Wave-fork views (visual check;
  the cockpit path is gone).
- [ ] **`j8i4` — retired-view tombstone.** Load a saved layout that references a
  removed widget (openfang/pal). **Expect:** a tombstone with an opt-in Close, not
  a broken/blank tab.

## Closing

When an item's expected result is observed, attach the screenshot + note to its
bd issue and close it. For the DT-7 batch, close `480i/lyzr/4wdp/ku6l` together
with the single shared boot evidence (do not run four separate GUI passes).
