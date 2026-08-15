# Recoder Documentation

**Recoder is the self-hosted convergence layer for coding agents.** You run your
chosen agents (Claude Code, Codex, Cursor, opencode, pi) in parallel, isolated git
worktrees, then converge N divergent runs into **one trusted, governed merge** —
with memory, retrieval, browsing, governance, and an audit trail the agents use
through a single MCP host. The product is a terminal; everything below is the
power behind it.

> Start with the four canonical private-beta documents below. Older roadmaps remain
> useful implementation history, but do not override their product scope, status
> vocabulary, connection boundaries, or delivery gates.

---

## 📘 User guide (how to use Recoder)

New here, or looking for end-user instructions? The **[User Guide](guide/README.md)**
is the task-oriented walkthrough — install, first parallel run, connecting agents
(Claude Code, Codex, opencode, …), review/converge/merge, governance, and BYOK.

| Guide | What it covers |
|---|---|
| [What is Recoder?](guide/01-what-is-recoder.md) | The idea, who it's for, how it differs. |
| [Install](guide/02-install.md) | Signed macOS DMG, first run, what the app starts. |
| [Quickstart](guide/03-quickstart.md) | Your first parallel run, end to end. |
| [Connect your agents](guide/04-connect-agents.md) | Claude Code, Codex, opencode, Cursor, Gemini CLI, and more. |
| [Review, converge & merge](guide/05-review-converge-merge.md) | Compare N runs → converge → governed merge. |
| [Governance & approvals](guide/06-governance-and-approvals.md) | Policy gate, approvals, audit trail, compliance export. |
| [Bring your own keys (BYOK)](guide/07-byok-and-keys.md) | Provider keys vs platform keys; never proxied. |
| [Troubleshooting](guide/08-troubleshooting.md) | Not-connected/not-available states and fixes. |

---

## Product & strategy

| Doc | What it is |
|---|---|
| [RECODER-FULL-PRODUCT-SPEC.md](RECODER-FULL-PRODUCT-SPEC.md) | **Canonical private-beta product contract:** user flows, surfaces, ownership, state, evidence, acceptance. |
| [RECODER-PRIVATE-BETA-PLAN.md](RECODER-PRIVATE-BETA-PLAN.md) | **Canonical active delivery plan:** release readiness, live product validation, beta operations, expansion triggers. |
| [OPEN-BEADS.md](OPEN-BEADS.md) | Complete open-bead inventory grouped by architectural lane and beta disposition. |
| [PRODUCT-THESIS.md](PRODUCT-THESIS.md) | The convergence thesis + locked product decisions. **Read first.** |
| [RECODER-PRODUCT-DESIGN.md](RECODER-PRODUCT-DESIGN.md) | Design principles: clean-first, backend/frontend split, no engine names in the UI. |
| [SECURITY-POSTURE.md](SECURITY-POSTURE.md) | Honest security posture: the 21-vuln sweep (fixed) + residual risk + before-multi-tenant-launch checklist. |
| [DESIGN-REFERENCE.md](DESIGN-REFERENCE.md) | Graphite / terminal-plain design system. |
| [OWNER-RUNBOOK.md](OWNER-RUNBOOK.md) | Credential/release-gated owner actions. |

## Architecture

| Doc | What it is |
|---|---|
| [RECODER-CONNECTION-ARCHITECTURE.md](RECODER-CONNECTION-ARCHITECTURE.md) | **Canonical runtime topology:** Electron, Go shell, Node control plane, engines, protocols, state, trust, packaging. |
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
| [OWNER-RUNBOOK.md](OWNER-RUNBOOK.md) | Credential/release-gated owner actions: sign/notarize/publish the dmg, sidecars, x64. |
| [growth/SEARCH-SUBMISSION-RUNBOOK.md](growth/SEARCH-SUBMISSION-RUNBOOK.md) | GSC/Bing/IndexNow search submission. |

## Research & reference

| Doc | What it is |
|---|---|
| [design-reference/conductor/README.md](design-reference/conductor/README.md) | Competitor design reference. |
