# Recoder — Docs

The doc system to follow. Read top to bottom.

| Doc | What it answers |
|-----|-----------------|
| [`PRD.md`](./PRD.md) | **Why / what** — problem, users, requirements (FR-1…FR-11: agents, workspaces, brain, governance, **device-flow + recognition**, billing, interop, **Envoy mesh**, **XDR**, **AMI self-host**). |
| [`PRODUCTS.md`](./PRODUCTS.md) | **The product line** — Desktop · Cloud · Teams/Enterprise · Agents/MCP, + pricing ladder + powered-by trees. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **How** — layers L0–L4, the **agent-execution model** (local tmux/dmux vs remote Daytona, BYOK), where Envoy/XDR/AMI fit. |
| [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) | **Every tree → its job** — all 129 dirs by layer, with kind/state/role/usedBy + keep/wire-up/park/drop verdicts. |
| [`architecture/RECODER-FUSION-PROGRAM.md`](./architecture/RECODER-FUSION-PROGRAM.md) | **Built-but-unused → consumer** — the 15 packages to wire into the product (using all the folders *means working this list*). |
| [`ROADMAP.md`](./ROADMAP.md) | **What to do, when** — milestones M0–M5, each step with owner-tree + a "done-when" that requires running end-to-end. |

**Ground truth (current + authoritative — read these first; they reflect what has
actually landed, and supersede older claims elsewhere in this doc set):**
| Doc | What it answers |
|-----|-----------------|
| [`architecture/RECODER-ENGINES.md`](./architecture/RECODER-ENGINES.md) | **The polyglot Agent-OS backend** — the 16-engine plan + §6 phased roadmap with per-phase delivery status. Phases 1–4 (+ the Phase 5 notify engine) built + wired through the governed MCP interop host + agent bridge, each degrade-safe + unit-tested (fleet supervisor · LLM gateway +OpenAI-compat · retrieval/RAG · code-intel · browser · coordination · workflow/hooks · PAL · notify); the rest of Phase 5 remains. |
| [`architecture/RECODER-CAPABILITIES.md`](./architecture/RECODER-CAPABILITIES.md) | **The capability map** — `c/ crates/ go/ py/ ts/ packages/` as backend power the agents wield, + the "21 in-proc servers" connection table (which executors are bound, reachable via `POST /api/mcp/tools/:server/:tool/call`). |
| [`architecture/RECODER-SHELL.md`](./architecture/RECODER-SHELL.md) | **The L3 terminal cockpit** — `apps/wave` (a Wave Terminal fork, Apache-2.0) rebranded to Recoder: 11 governed blocks + the launch→session→review→merge product loop. Built + builds end-to-end; the Electron **GUI is not yet launch-verified**. |

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

**The backend engine fleet + the terminal shell have landed** (see the ground-truth
docs above). Phases 1–4 (+ the Phase 5 notify engine) of
[`RECODER-ENGINES.md`](./architecture/RECODER-ENGINES.md) are **built + wired**
through the governed MCP interop host + agent bridge, each **degrade-safe +
unit-tested**: fleet supervisor, LLM gateway (+OpenAI-compat), retrieval (RAG),
code-intel (semantic `repo.search`), browser, coordination (work-locks), workflow
(verify/hooks), PAL planning, and notify — **21 in-proc capability servers**
reachable via `POST /api/mcp/tools/:server/:tool/call`. The rest of Phase 5
(connectors · work-signals · networking) remains. Separately,
`apps/wave` (the Wave Terminal fork) is fully rebranded to Recoder, cloud-decoupled,
and **builds end-to-end** (Go backend + electron-vite frontend, both exit 0), carrying
an 11-block governed cockpit.

**Honest state:** "built + committed on a branch + unit-tested + builds" is **not**
"shipped / deployed / live" and **not** GUI-verified. The Electron shell has **not**
been launched here, so its appearance + live interaction are unverified.
**Deploy + billing capabilities are deferred (filed), not live.**

The earlier milestone frame still applies for the *shipping* app (`apps/desktop`, the
Preact cockpit): **Milestone 1 — self-contained desktop** boots the embedded backend
(tmux + engines), and two headless proofs (no BYOK key) keep that claim truthful:
- `apps/desktop/scripts/dev-boot-proof.js` — the `BackendSupervisor` boots the
  embedded `docker-backend` and `GET /api/conductor/health` returns 200 with the
  substrate shape (proof the embedded backend really boots).
- `docker-backend/scripts/e2e-conductor-loop.ts` — the real fused conductor loop
  runs end-to-end (`created → running → awaiting_review`) over a BYOK-free
  in-process substrate (proof the loop actually executes).

Then M2 device-flow/auth, M3 cloud + billing, M4 distribution, M5 teams
(Envoy/XDR/AMI).
