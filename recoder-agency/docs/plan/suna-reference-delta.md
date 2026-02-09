# Suna Reference Delta for Recoder Agency

## Purpose

Use the local `suna` repository as a product and architecture reference while implementing Recoder Agency as an original codebase.

Reference path:
- `/Users/arhansubasi/recoder.xyz/suna`

Target implementation:
- `/Users/arhansubasi/recoder.xyz/recoder-agency`

## License-Safety Guardrails

Suna is under KPSL with explicit restrictions around rebrand/commercialization/network offering and competing alternatives.

Operational policy for this repo:
- Use Suna for feature discovery, architecture ideas, and UX patterns only.
- Do not copy source files, assets, or substantial code blocks into `recoder-agency`.
- Re-implement behavior with Recoder-native naming, flows, and UI.
- Keep a trace log per feature: `reference consulted` and `independent implementation notes`.

## Capability Map (Reference -> Recoder)

| Capability | Suna reference | Recoder Agency current status | Owner agent | Subagent |
|---|---|---|---|---|
| Chat/task runtime + work orchestration | `suna/backend/core/threads`, `suna/backend/core/agents`, `suna/backend/core/tools` | Partially present (`apps/agency/app/(main)/tasks`, `apps/agency/lib/internal-api/tasks.ts`) | Platform Engineering | Backend (`ts-coder`) |
| Browser/system/file tooling runtime | `suna/backend/core/sandbox`, `suna/backend/core/files` | Partial (workflow + file APIs exist; sandbox ops not productized for agency pipeline) | Platform Engineering | Architecture + Backend |
| Agent builder/dashboard UX | `suna/apps/frontend/src` | Strong base exists (`internal-packages/workflow-designer-ui`, stage/workspaces UI) | Platform Engineering | Frontend (`react-coder`) + UX (`ux-guardian`) |
| Client project intake and briefs | Suna workflow patterns + thread forms | Present foundation (`apps/agency/app/(client)/portal/briefs`, transactional brief emails) | Product Strategy | Acceptance Criteria |
| Client portal + approvals | Suna thread/result flow | Present foundation (`apps/agency/app/(client)/portal/projects`, `/client-portal`) | Delivery Ops | Handoff |
| Background jobs and queues | Suna worker/runtime model (docker compose worker) | Needs hardening for agency delivery lifecycle | Platform Engineering | Backend |
| Billing and subscriptions | Suna billing modules (`backend/core/billing`) | Present foundation (Stripe flows in `apps/agency/services/teams/actions`) | Revenue | Pricing |
| Integrations (GitHub, Google, external APIs) | `suna/backend/core/integrations/*` style under core modules | Present foundation (`apps/agency/services/external/github`, `google`, `stripe`) | Platform Engineering | Backend |
| Analytics/metrics instrumentation | `suna/backend/core/analytics` | Needs KPI-focused instrumentation for agency margins | Program Orchestrator | Metrics |
| Mobile/Desktop channels | `suna/apps/mobile`, `suna/apps/desktop` | Not in near-term scope (web-first) | Program Orchestrator | Roadmap |

## Implementation Delta (Next 4 Weeks)

## Workstream A: Delivery State Machine (P0)

Goal:
- Move from generic tasks to agency delivery lifecycle.

Implement in Recoder:
- Canonical states: `queued`, `in_progress`, `qa`, `client_review`, `done`, `blocked`.
- Transition rules and audit log.
- Operator override actions with reason capture.

Owner:
- Platform Engineering Agent -> Backend Subagent (`ts-coder`).

## Workstream B: Brief-to-Delivery Pipeline (P0)

Goal:
- End-to-end path from client brief to approved deliverable.

Implement in Recoder:
- Structured brief schema + validation.
- Project kickoff endpoint.
- Delivery artifact model (links/files/checklist).
- Client approval/revision loop in portal.

Owner:
- Product Strategy Agent + Delivery Ops Agent.

## Workstream C: QA Gate Runner (P0)

Goal:
- Increase first-pass acceptance and reduce manual fixes.

Implement in Recoder:
- Automated quality checks per deliverable type.
- Confidence score + fail reasons.
- Auto-return to `in_progress` when QA fails.

Owner:
- Delivery Ops Agent -> QA Subagent (`proofreader` + tests).

## Workstream D: Margin Instrumentation (P0)

Goal:
- Measure automation and profitability by project.

Implement in Recoder:
- Event schema for `automation_rate`, `override_rate`, `cycle_time`, `acceptance_first_pass`.
- Dashboard seed queries.
- Weekly scorecard export.

Owner:
- Program Orchestrator Agent -> Metrics Subagent.

## Workstream E: Agent UX Productization (P1)

Goal:
- Convert builder/runtime capabilities into agency-facing operator UX.

Implement in Recoder:
- Operator console for exception handling.
- Project timeline view (brief -> execution -> QA -> review).
- Reusable project templates by service type.

Owner:
- Platform Engineering Agent -> Frontend Subagent (`react-coder`) + UX Subagent (`ux-guardian`).

## Agent/Subagent Task Board (Immediate)

1. Program Orchestrator / Roadmap:
- Freeze one launch niche and one service package.
- Define Phase 0 exit checklist.

2. Platform Engineering / Architecture:
- Draft data model for projects, briefs, deliverables, QA checks, review events.
- Define queue/job boundaries.

3. Platform Engineering / Backend (`ts-coder`):
- Build delivery state machine primitives + transition guard functions.

4. Platform Engineering / Frontend (`react-coder`):
- Build minimal client review screen with approve/request-changes.

5. Delivery Ops / QA (`proofreader`):
- Define quality rubric and machine-checkable criteria for first service type.

6. Revenue / Pricing:
- Map cost inputs per job and define minimum viable pricing floor.

## Out of Scope (Now)

- Direct Suna code migration.
- Mobile/desktop parity.
- Multi-vertical expansion before one niche is profitable.

## Definition of Done for Referenced Features

A feature inspired by Suna is done only if:
- Recoder implementation is original and repo-native.
- Agent owner and KPI linkage are documented.
- It passes functional tests and instrumentation is present.

## Changelog

- 2026-02-07: Created initial Suna reference delta and agent-assigned workstreams.
