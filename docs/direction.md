# Recoder Direction — Surface Decisions

Last updated: 2026-06-21

This is the decision record for **what recoder.xyz is building and what it is cutting**.
It sits above `plan.md` (sequencing) and `remaining.md` (launch gate) and resolves
the product-surface sprawl. When a surface's status here conflicts with an older
doc, this file wins for keep/cut decisions.

## What we are building (one sentence)

Recoder is the **control plane for AI agents** — one workspace where humans and
many agents take tasks, work under durable identity and policy, and ship software
through artifacts, PRs, previews, and approvals with a full audit trail. The wedge
is *"many agents need one workspace,"* not *"our agent is smarter."*

The moat is the spine, not the UI: `packages/agent-os` (canonical domain) +
`docker-backend` `/api/agent-os/*` routes (canonical state owners). Everything
else is a replaceable leaf.

## Evidence behind these decisions (2026-06-21)

Captured from the live Hetzner host + the strategy docs:

- **The moat is healthy.** `recoder-docker-backend` is up (port 3100, healthy),
  with `recoder-redis`, `qdrant`, and `text-embedding-inference` alongside it.
- **The agent platform is pre-launch with ~0 real users.** Live nginx traffic is
  dominated by **vcpeer** paths (`/vcs`, `/request-research`,
  `/anonymous-founder-review`, investor sitemaps). No agent-platform path
  (`/agent-os`, `/workspaces`, `/api/agent-os/*`, `/dashboard`) appears in the top
  20 requests. vcpeer is a **separate VC-research product** on the same box and is
  **off-limits** — it is what generates real traffic here.
- **The real cost is sprawl, not compute.** Four deployed front-ends + two
  backends, all pre-revenue. RAM is fine (apps are 65–330 MB); the only hard
  constraint is disk (86% used, ~22 GB free), driven by build trees + vcpeer.

Conclusion: collapse surface area to match a pre-launch product. Focus beats
breadth.

## Surface decisions

| Surface | Decision | Role going forward |
| --- | --- | --- |
| `packages/agent-os` | **KEEP — moat** | Canonical domain spine. No runtime/UI imports. |
| `docker-backend` | **KEEP — moat** | Agent OS API + capability layer. Canonical state owner. |
| `app/` → recoder.xyz | **KEEP — consumer** | End-user Spaces + auth source of truth. Consumer-facing workspace. |
| `recoder-agents/` → agents.recoder.xyz | **KEEP — operator** | Operator / mission-control UI. Home of the run timeline, approval gate, delivery pipeline, billing/usage, live updates. |
| Recoder Code (CLI) | **KEEP — wedge demo** | First-party reference agent; the killer demo. |
| A2A Gateway | **KEEP — interop** | External-agent ingress; projects into Agent OS state. |
| `recoder-agency/` → agency.recoder.xyz | **FREEZE** | Later monetization (client delivery). Keep the code; stop active investment now. Do not delete. |
| `recoder-pm/` → pm.recoder.xyz | **KEEP (consolidate later)** | Approval/handoff surface. Its approval views now also exist in `recoder-agents`; fold in over time rather than expanding it. |
| `recoder-web/` | **RETIRED** | Already removed from the tree. Finish cleaning lingering references (bd `recoder-26j7`). |
| `recoder-studio/` | **REMOVED** | Abandoned, zero strategy-doc support, already gone from the tree. Remove lingering references + stale deploy/registry entries. |
| OpenClaw | **NOT A PRODUCT** | Demoted to a runtime-adapter / gateway source. Do not deploy as a surface. Keep source for later gateway extraction; remove product deploy + nginx vhost references. |
| vcpeer | **DO NOT TOUCH** | Separate product, separately owned, the live traffic on this box. |
| Recoder Edge / Marketplace / Launch | **DEFERRED** | Later modules. Must not define the current build cycle. |

## Front-end model: app + agents stay distinct

Two surfaces with **clear, non-overlapping roles** (not one merged app):

- **recoder.xyz (`app/`)** — consumer: marketing, auth/identity (source of truth),
  Spaces creation, end-user workspace.
- **agents.recoder.xyz (`recoder-agents/`)** — operator: mission control over the
  agent work loop (tasks, runs, timeline, approvals, PR delivery, work signals,
  handoffs, outbox, plan/usage).

Shared rule: both call `/api/agent-os/*`; neither owns canonical state. Avoid
rebuilding the same view in both — operator views live in `recoder-agents`,
consumer/Spaces views live in `app/`.

## Immediate follow-through (tracked in bd)

1. Remove stale `recoder-studio` entries from deploy + surface-registry scripts.
2. Finish `recoder-web` reference cleanup (`recoder-26j7`).
3. Stop deploying OpenClaw as a product surface; remove its nginx vhost
   (`openclaw.recoder.xyz`) and product deploy references. Server nginx changes
   are approval-gated and applied separately.
4. Mark `recoder-agency` frozen in deploy notes; keep it building but stop feature
   investment.
5. Keep focusing engineering on the launch gate (`remaining.md`) on the
   `app` + `agents` surfaces only.
