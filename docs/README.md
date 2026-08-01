# Recoder Documentation

**Recoder is the self-hosted convergence layer for coding agents.** You run your
chosen agents (Claude Code, Codex, Cursor, opencode, pi) in parallel, isolated git
worktrees, then converge N divergent runs into **one trusted, governed merge** —
with memory, retrieval, browsing, governance, and an audit trail the agents use
through a single MCP host. The product is a terminal; everything below is the
power behind it.

> Start here, then follow the map. Every doc is code-grounded and reconciled to
> what actually shipped.

---

## Product & strategy

| Doc | What it is |
|---|---|
| [PRODUCT-THESIS.md](PRODUCT-THESIS.md) | The convergence thesis + locked product decisions. **Read first.** |
| [RECODER-PRODUCT-DESIGN.md](RECODER-PRODUCT-DESIGN.md) | Design principles: clean-first, backend/frontend split, no engine names in the UI. |
| [STATUS.md](STATUS.md) | Single source of truth for where the product is right now. |
| [SECURITY-POSTURE.md](SECURITY-POSTURE.md) | Honest security posture: the 21-vuln sweep (fixed) + residual risk + before-multi-tenant-launch checklist. |
| [CONDUCTOR-PARITY-AND-SHIPPABILITY.md](CONDUCTOR-PARITY-AND-SHIPPABILITY.md) | Recoder vs Conductor.build parity + the "here → production multi-user" roadmap (P0/P1/P2 + critical path). |
| [DESIGN-REFERENCE.md](DESIGN-REFERENCE.md) | Graphite / terminal-plain design system. |
| [OWNER-RUNBOOK.md](OWNER-RUNBOOK.md) | Credential/release-gated owner actions. |

## Architecture

| Doc | What it is |
|---|---|
| [RECODER-ARCHITECTURE.md](RECODER-ARCHITECTURE.md) | Canonical layer stack + engine→module map. |
| [RECODER-MODULES.md](RECODER-MODULES.md) | Per-module capability index (links to the specs below). |
| [architecture/TERMINAL-UNIFICATION.md](architecture/TERMINAL-UNIFICATION.md) | Desktop↔backend terminal unification (buckets A/B). |
| [RECODER-BACKEND/ARCHITECTURE.md](RECODER-BACKEND/ARCHITECTURE.md) | Backend master map: 15 directories, 14 domains, language policy. |
| [RECODER-BACKEND/ENGINE-INTEGRATION.md](RECODER-BACKEND/ENGINE-INTEGRATION.md) | How OSS engines are wired (transport ladder, adapter→desktop→run flow). |
| [RECODER-BACKEND/FUSION-STATUS.md](RECODER-BACKEND/FUSION-STATUS.md) | Engine → fusion-level → consumer-callsite map + remaining open items. |

## Modules — agent capabilities (backend + desktop + MCP)

Each module is wired on both the backend and the desktop app and exposed to agents
through the governed MCP host. These specs document the real implementation, the
agent-facing `recoder_*` tools, and how each surfaces to the user.

| Module | Capability |
|---|---|
| [agent-engine](modules/agent-engine.md) | In-process runtime dispatch (openfang) + provenance-gated spawns. |
| [browsing](modules/browsing.md) | Headless browser open/navigate/snapshot/extract/verify. |
| [communication](modules/communication.md) | Pal planning / deliberation + A2A interop. |
| [github](modules/github.md) | PR create/review, repo search/diff, checks. |
| [governance](modules/governance.md) | Policy decisions, approvals, work-locks, tool-exec gate. |
| [inference](modules/inference.md) | TensorZero ladder: infer/stream/embed/feedback, BYOK vault. |
| [memory](modules/memory.md) | Issue-graph memory, mem0, colbert retrieval. |
| [networking](modules/networking.md) | Cloud mesh data plane (ziti/xDS) — deferred until launch. |
| [signals](modules/signals.md) | Work-signals + ops-recorder observability. |
| [social](modules/social.md) | 7 channel connectors → conductor dispatch (untrusted-input gated). |
| [squads](modules/squads.md) | Multi-agent coordination + routing. |
| [terminal](modules/terminal.md) | The core: parallel worktrees, compare, converge, merge. |

## Backend domains — design of record

Specs for each `backend/src/domains/*` domain (all shipped; kept as capability
references):

- [agent-os-control-plane](RECODER-BACKEND/domains/agent-os-control-plane.md)
- [conductor-terminal](RECODER-BACKEND/domains/conductor-terminal.md)
- [governance-security](RECODER-BACKEND/domains/governance-security.md)
- [identity-auth](RECODER-BACKEND/domains/identity-auth.md)
- [edge-api-server](RECODER-BACKEND/domains/edge-api-server.md)
- [database-persistence](RECODER-BACKEND/domains/database-persistence.md)
- [engines-integration](RECODER-BACKEND/domains/engines-integration.md)
- [inference-gateway](RECODER-BACKEND/domains/inference-gateway.md)
- [memory-retrieval](RECODER-BACKEND/domains/memory-retrieval.md)
- [billing-metering](RECODER-BACKEND/domains/billing-metering.md)
- [social-connectors](RECODER-BACKEND/domains/social-connectors.md)
- [cloud-infra](RECODER-BACKEND/domains/cloud-infra.md)
- [observability-ops](RECODER-BACKEND/domains/observability-ops.md)
- [a2a-interop-runtimes](RECODER-BACKEND/domains/a2a-interop-runtimes.md)

## Desktop & runbooks

| Doc | What it is |
|---|---|
| [DESKTOP-UX-STATE-AND-PLAN.md](DESKTOP-UX-STATE-AND-PLAN.md) | Desktop UX state + remaining tracked work. |
| [DESKTOP-PACKAGING-RUNBOOK.md](DESKTOP-PACKAGING-RUNBOOK.md) | Arch-aware packaging, signing, dmg. |
| [growth/SEARCH-SUBMISSION-RUNBOOK.md](growth/SEARCH-SUBMISSION-RUNBOOK.md) | GSC/Bing/IndexNow search submission. |

## Research & reference

| Doc | What it is |
|---|---|
| [research/OSS-ADOPTION-2026-07.md](research/OSS-ADOPTION-2026-07.md) | OSS adoption roadmap (actively executed). |
| [design-reference/conductor/README.md](design-reference/conductor/README.md) | Competitor design reference. |
