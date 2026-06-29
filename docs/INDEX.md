# Recoder — Documentation Index

> The single entry point to `docs/`. Pick your lane below. Every doc is one click
> away, with a one-line "what it answers". For the opinionated read-order, see the
> [`README.md`](./README.md).

Recoder is the OS for running **your own** coding-agent CLIs in parallel — each in
an isolated git worktree, governed by a control plane. The docs are grouped by who
you are: **Users**, **Operators**, **Builders**, **Product/Strategy**.

---

## Users — run the app

| Doc | What it answers |
|-----|-----------------|
| [`GETTING-STARTED.md`](./GETTING-STARTED.md) | Install, boot the desktop app, run your first conductor agent run; includes the headless boot/loop proofs to verify a clean setup. |
| [`USER-GUIDE.md`](./USER-GUIDE.md) | The desktop **Cockpit** — launch agents into worktrees, watch them live, review diffs, approve/merge. |
| [`CLI-REFERENCE.md`](./CLI-REFERENCE.md) | The `recoder conductor` CLI (`recoder-code`) — auth via device flow, drive runs, BYOK keys, every command + flag. |

## Operators — self-host & secure

| Doc | What it answers |
|-----|-----------------|
| [`SELF-HOST.md`](./SELF-HOST.md) | Self-host the control plane — compose stack, `scripts/selfhost-up.sh`, the fail-closed Envoy ext_authz→governance gate, Packer AMI, pointing desktops at your own backend. |
| [`SECURITY-INCIDENTS.md`](./SECURITY-INCIDENTS.md) | Append-only incident log — IOCs and defenses only (no creds/infra topology). |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Also covers runtime env vars (`AGENT_OS_REPOSITORY`, `CONDUCTOR_WORKTREE_ROOT`), embedded-backend boot, and the 3 verification proofs. |

## Builders — develop & extend

| Doc | What it answers |
|-----|-----------------|
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Contributor guide — monorepo layout, dev loop, and how to run the real fused engines headlessly. |
| [`architecture/DIAGRAMS.md`](./architecture/DIAGRAMS.md) | 9 mermaid diagrams — system layers, server internals, desktop, cloud, MCP/agents, agent-comms, teams mesh, brain/RAG, runtime-driver contract. |
| [`architecture/SURFACE-MAP.md`](./architecture/SURFACE-MAP.md) | Every component → which surface(s) it powers + how it's wired (in-process / subprocess / http-edge / park / drop). |
| [`architecture/INTEGRATION-PLAN.md`](./architecture/INTEGRATION-PLAN.md) | How the pieces connect — comms model (`pal` + `coordination`), per-surface wiring checklist, in-process-vs-subprocess-vs-http rule. |
| [`CONDUCTOR-ARCHITECTURE.md`](./CONDUCTOR-ARCHITECTURE.md) | The parallel coding-agent system — tmux + git worktrees + control-plane state-of-record + reconciler. |
| [`API-REFERENCE.md`](./API-REFERENCE.md) | The real HTTP API — `/api/conductor/*`, `/api/agent-os/*`, `/api/a2a/*`, `/api/auth/cli` device-flow; auth model + `{success,data}` envelope, each route cited to source. |
| [`CLI-REFERENCE.md`](./CLI-REFERENCE.md) | The `recoder conductor` CLI (in `recoder-code`) — subcommands, env/config, device-flow login. |
| [`PACKAGES.md`](./PACKAGES.md) | Per-package inventory of the monorepo with origin and keep/park/drop verdicts. |

## Product / Strategy — why & what, when

| Doc | What it answers |
|-----|-----------------|
| [`PRD.md`](./PRD.md) | Product requirements — problem, users, FR-1…FR-11 (agents, workspaces, brain, governance, device-flow, billing, interop, mesh, XDR, AMI self-host). |
| [`PRODUCTS.md`](./PRODUCTS.md) | The product line — Desktop · Cloud · Teams/Enterprise · Agents/MCP, with pricing ladder + powered-by trees. |
| [`ROADMAP.md`](./ROADMAP.md) | What to build next — milestones M0–M5, each step with owner-tree and a "done-when" that requires running end-to-end. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | The product architecture — layers L0–L4 and the local-tmux-vs-remote-Daytona agent-execution model (BYOK). |
| [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) | Every tree → its job, by layer, with kind/state/role/usedBy + keep/wire-up/park/drop verdicts. |
| [`WIRE-UP-BACKLOG.md`](./WIRE-UP-BACKLOG.md) | Built-but-unused first-party code → its consumer; the list that "using all the folders" actually means. |
| [`directory_list.md`](./directory_list.md) | Readable status-at-a-glance index of every meaningful tree → role → status. |

### Reference / background (kept)

| Doc | What it answers |
|-----|-----------------|
| [`RECODER-PRODUCT-ARCHITECTURE.md`](./RECODER-PRODUCT-ARCHITECTURE.md) | Institutional product & directory architecture (background). |
| [`PRODUCT-PLAN.md`](./PRODUCT-PLAN.md) | Forward-looking product & products plan grounded in the actual code across all trees. |
| [`WORKING-PRODUCT-PLAN.md`](./WORKING-PRODUCT-PLAN.md) | "Make it actually work" plan — get ONE real end-to-end flow (login → run → diff) shipping. |

---

## The 3 live proofs

No claim is "done" until it runs end-to-end. Three headless proofs drive the
**real, fused** engines with no live server and **no BYOK model key** — each exits
non-zero on failure (see [`DEVELOPMENT.md`](./DEVELOPMENT.md) §5).

| # | Proof | What it proves |
|---|-------|----------------|
| 1 | [`docker-backend/scripts/e2e-conductor-loop.ts`](../docker-backend/scripts/e2e-conductor-loop.ts) | The fused conductor loop runs `created → running → awaiting_review` over a real git worktree + honest stub `in_process` substrate. |
| 2 | [`docker-backend/scripts/e2e-conductor-approval.ts`](../docker-backend/scripts/e2e-conductor-approval.ts) | The delivery governance gate (FR-5): a gated action is held without an approved Approval, then proceeds once one is created + approved; verifies the SHA-256 Merkle audit chain. |
| 3 | [`apps/desktop/scripts/dev-boot-proof.js`](../apps/desktop/scripts/dev-boot-proof.js) | The desktop `BackendSupervisor` boots the embedded `docker-backend`; `GET /api/conductor/health` returns `200` with the substrate shape `{ available, git, tmux, tmuxBin }`. |

Run them:

```bash
# 1 — conductor loop
npx tsx docker-backend/scripts/e2e-conductor-loop.ts

# 2 — approval / governance
npx tsx docker-backend/scripts/e2e-conductor-approval.ts

# 3 — desktop dev-boot (from apps/desktop)
npm run dev:boot-proof
```
