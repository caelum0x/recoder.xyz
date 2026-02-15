# Recoder A2A Core Product Idea

Last updated: 2026-02-14

## Why People Will Use This

Teams already use multiple coding agents, but they lose time in:
- copy/paste between tools,
- broken context across sessions,
- no reliable handoff/audit trail,
- no policy control for risky operations.

Recoder A2A solves this by making multi-agent work operationally reliable:
- one envelope contract,
- one orchestration plane,
- one audit/policy surface,
- terminal + web connected through secure bridge.

## Who We Target

Primary:
- AI-native builders and agencies shipping production code weekly.
- CTO/founding-engineer teams that need speed with governance.

Secondary:
- Platform/DevEx teams standardizing internal agent workflows.
- PM/ops users who need visibility on who did what and why.

## Core Functionality

1. Multi-Agent Orchestration
- Modes: `codex_only`, `claude_only`, `parallel`, `handoff`, `fallback`.
- Deterministic merge for parallel execution.
- Collaboration assignments so multiple agents contribute in one run (driver/reviewer/support), not just winner-only output.
- Manual override and recompute controls.

2. Cross-Environment Execution
- Cloud services communicate over signed A2A envelopes.
- Local Codex/Claude CLIs connected via outbound bridge daemon.
- Works behind NAT/firewall (no inbound local ports required).

3. Governance + Safety
- Signature verification, replay protection, idempotency.
- Runtime policy controls:
  - allowlisted intents
  - max targets
  - deadline budgets
  - dual-approval intents
- Operator override history (append-only timeline).
- Optional orchestration scope isolation for multi-tenant/team-safe access.

4. Observability + Audit
- Audit events for routing, policy rejections, overrides, recompute.
- Orchestration state by `threadId + traceId`.
- Heartbeats + bridge status for operator health checks.
- Realtime orchestration history stream (SSE) for live multi-agent timeline UI.
- Reconnect-safe stream semantics (event replay token + server-side filtering).

## Product Promise

"Use both Codex and Claude Code without operational chaos."

Recoder provides:
- speed from parallel/handoff execution,
- reliability from deterministic routing/merge,
- accountability from traceable decisions and policy controls.

## Adoption Wedge

1. Single user installs bridge and enables `parallel` mode.
2. Team uses dual-approval and audit for higher-risk tasks.
3. Org standardizes workflows through policy APIs and service cards.

## Success Metrics

- Time-to-merged-result (parallel mode).
- Override frequency and conflict rate.
- Failed handoff/retry/deadletter rates.
- Share of tasks completed with traceable provenance.
