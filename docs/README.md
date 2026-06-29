# Recoder — Docs

The doc system to follow. Read top to bottom.

| Doc | What it answers |
|-----|-----------------|
| [`PRD.md`](./PRD.md) | **Why / what** — problem, users, requirements (FR-1…FR-11: agents, workspaces, brain, governance, **device-flow + recognition**, billing, interop, **Envoy mesh**, **XDR**, **AMI self-host**). |
| [`PRODUCTS.md`](./PRODUCTS.md) | **The product line** — Desktop · Cloud · Teams/Enterprise · Agents/MCP, + pricing ladder + powered-by trees. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **How** — layers L0–L4, the **agent-execution model** (local tmux/dmux vs remote Daytona, BYOK), where Envoy/XDR/AMI fit. |
| [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) | **Every tree → its job** — all 129 dirs by layer, with kind/state/role/usedBy + keep/wire-up/park/drop verdicts. |
| [`WIRE-UP-BACKLOG.md`](./WIRE-UP-BACKLOG.md) | **Built-but-unused → consumer** — the 15 packages to wire into the product (using all the folders *means working this list*). |
| [`ROADMAP.md`](./ROADMAP.md) | **What to do, when** — milestones M0–M5, each step with owner-tree + a "done-when" that requires running end-to-end. |

**Architecture (the map — `docs/architecture/`):**
| Doc | What it answers |
|-----|-----------------|
| [`architecture/DIAGRAMS.md`](./architecture/DIAGRAMS.md) | **9 mermaid diagrams** — system layers · server internals · desktop · cloud · MCP/agents · **agent-comms via `pal`** (codex↔CC↔pi, CC↔CC) · teams Envoy/xDS/XDR/AMI mesh · brain/RAG · runtime-driver contract. Every node is a real directory. |
| [`architecture/SURFACE-MAP.md`](./architecture/SURFACE-MAP.md) | **Every component → which surface(s) it powers + how it's wired** (in-process-import / subprocess-cli / http-edge / park / drop), grouped by surface. |
| [`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md) | **How we connect it all** — the comms model (`pal` as decision layer + `coordination` as bus), per-surface wiring checklist, the in-process-vs-subprocess-vs-http rule, and open decisions. |

Reference (kept): `CONDUCTOR-ARCHITECTURE.md`, `RECODER-PRODUCT-ARCHITECTURE.md`,
`PACKAGES.md`, `WORKING-PRODUCT-PLAN.md`.

## The rules
1. **Don't fake-ready.** A step is done only when it runs end-to-end, not when it
   compiles. Truthful health everywhere.
2. **Use the stack.** "Using all the folders" = the WIRE-UP-BACKLOG. The engines
   only count when the shipping product imports + runs them.
3. **Local-first, BYOK, fail-closed, no secrets in repo.**
4. Park vendored clones; drop dead dirs; keep the owned core legible.

## Current focus
**Milestone 1 — self-contained desktop**: the Electron app boots the embedded
backend (tmux + the engines) so the `.dmg` is a real product, not a shell.
**11/15 of the WIRE-UP-BACKLOG are wired**, and two headless proofs (no BYOK key)
keep that claim truthful:
- `apps/desktop/scripts/dev-boot-proof.js` — the `BackendSupervisor` boots the
  embedded `docker-backend` and `GET /api/conductor/health` returns 200 with the
  substrate shape (proof the embedded backend really boots).
- `docker-backend/scripts/e2e-conductor-loop.ts` — the real fused conductor loop
  runs end-to-end (`created → running → awaiting_review`) over a BYOK-free
  in-process substrate (proof the loop actually executes).

Then M2 device-flow/auth, M3 cloud + billing, M4 distribution, M5 teams
(Envoy/XDR/AMI).
