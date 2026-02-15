# Recoder Core Idea And Build Plan

## 1) Core Idea
Recoder is a multi-surface AI software factory that lets teams ship production changes by delegating work to coordinated agents with strict safety, visibility, and fallback controls.

The core promise is:
- faster delivery than manual coding,
- safer than autonomous black-box agents,
- consistent across CLI, web workbench, and desktop.

## 2) Why People Will Use It
People will use Recoder when they need:
- real throughput: parallel execution across repos/lanes,
- operational confidence: deterministic health checks, explicit blockers, strict contract gating,
- less tool sprawl: one workflow from planning to implementation to validation.

Primary user value:
- Ship more changes per week with fewer regressions.
- Know exactly why something failed (contract mismatch, auth, sandbox, backend).
- Run the same workflow in local dev, desktop, and cloud-backed execution.

## 3) Who We Are Targeting
## ICP (Ideal Customer Profile)
- AI-first product teams (2-30 engineers) maintaining multi-repo stacks.
- Founders/CTOs who need velocity but cannot accept low-reliability agent output.
- Platform/devtool teams building internal automation where auditability matters.

## User Personas
- Solo founder engineer: wants rapid feature shipping with guardrails.
- Tech lead: wants agent delegation + deterministic CI gating.
- Platform engineer: wants contract-safe orchestration and observable workflows.

## 4) Core Functionality (Product Pillars)
## A. Orchestration
- Multi-lane agent workflow planning (`agents workflow`).
- Delegation with retries/fallbacks and strict path ownership.
- Contract-aware backend integration.

## B. Reliability + Safety
- Contract markers and strict mismatch handling.
- Sandbox doctor + runtime checks.
- Structured diagnostics (`backend`, `fallbackReason`, `warnings`, `state`).

## C. Visibility + Automation
- Machine-readable taxonomy in status/doctor/workflow-health.
- Deterministic exit semantics for CI.
- Actionable next-actions in every health report.

## D. Cross-Surface Parity
- Same workflow behavior in OpenClaw CLI, recoder-web workbench, and desktop IPC.
- Shared contract vocabulary:
  - `internal-agent-workflow-v1`
  - `public-agent-workflow-v1`

## 5) Positioning Statement
Recoder is not a chat assistant. It is an execution system for software delivery: plan, delegate, validate, and gate releases with explicit reliability contracts.

## 6) Product Requirements To Win
## Must-have
- End-to-end strict contract mode across all surfaces.
- Health command that can block CI with deterministic failure reasons.
- Delegation UX that makes attempts/retries/fallbacks obvious.

## Should-have
- Lane-level queue/ownership view in workbench UI.
- Retry policy controls per lane.
- One-click rerun of failed lanes with preserved context.

## 7) 90-Day Build Plan
## Phase 1: Reliability Backbone (Weeks 1-3)
- Complete strict contract plumbing everywhere:
  - OpenClaw workflow + workflow-health
  - recoder-web delegateSubagent route/runtime
  - desktop IPC workflow fetch
  - docker-backend contract markers
- Done when:
  - every surface emits `contract`, `responseContract`, `contractStatus`
  - strict mode can hard-fail on mismatch.

## Phase 2: Orchestration UX (Weeks 4-7)
- Add lane-level visibility in workbench:
  - status per lane (pending/running/retry/fallback/blocked),
  - delegation trace (who did what, why fallback happened).
- Done when:
  - user can diagnose any failed run in under 2 minutes.

## Phase 3: CI + Operational Adoption (Weeks 8-10)
- Standardize CI recipes:
  - `openclaw doctor --json`
  - `openclaw status --json`
  - `openclaw agents workflow-health --strict --json`
- Done when:
  - CI failures map to stable taxonomy IDs and suggested fixes.

## Phase 4: Differentiation (Weeks 11-13)
- Add reusable delegation templates:
  - feature build,
  - bug triage + fix,
  - migration rollout.
- Done when:
  - first-time user can ship via template without custom setup.

## 8) KPIs (North Star + Leading)
## North Star
- Weekly successful agent-driven code changes merged to main.

## Leading Indicators
- Workflow success rate (healthy/degraded/blocked distribution).
- Mean-time-to-diagnose failed workflow.
- Strict contract failure rate over time (should trend down).
- Ratio of local fallback vs docker-backend success.

## 9) Immediate Engineering Backlog (Execution Order)
1. Add strict propagation tests in recoder-web action-runner path (request payload assertions).
2. Add smoke checks for workbench parity in desktop/OpenClaw health command.
3. Add docs page with CI gating examples and expected exit code matrix.
4. Add lane-level workflow telemetry event schema (attempt, fallback, contract mismatch).
5. Add initial workbench panel for per-lane lifecycle visibility.

## 10) Simple Narrative We Tell Users
"Recoder gives your team an AI execution layer for software delivery: multi-agent speed, production-grade guardrails, and CI-ready reliability signals."

