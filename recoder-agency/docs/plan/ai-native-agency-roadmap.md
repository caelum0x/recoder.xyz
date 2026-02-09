# Recoder Agency: AI-Native Agency Execution Plan

## Strategic Positioning

Problem: Traditional agencies scale through headcount and manual delivery.

Opportunity: Build an AI-native agency platform that delivers finished work with software-like margins.

## Product Portfolio (Recoder Org)

| Product | What | Status | Priority |
|---|---|---|---|
| Recoder | AI web IDE | Built | Maintain + integrate |
| Recoder Agency | AI-native agency platform | Build now (Suna-inspired implementation) | P0 |
| Recoder PM | AI product management | Build later (fork Eververse) | P2 |

## North Star for Recoder Agency

- Delivery outcome: finished work delivered to clients, not just drafts.
- Margin outcome: maximize automation rate per project.
- Time outcome: reduce brief-to-delivery cycle time.

Primary KPIs:
- `automation_rate`: % of project tasks completed by AI workflows without manual rewrite.
- `delivery_cycle_time`: brief intake to approved deliverable.
- `gross_margin_per_project`.
- `human_override_rate`: % tasks requiring manual intervention.
- `client_acceptance_first_pass`: % deliverables approved on first review.

## Platform Decision Points (Finalize in Week 1)

1. Domain strategy:
- Recommend: `agency.recoder.xyz` for product, keep `recoder.xyz` root for Recoder IDE.

2. Brand architecture:
- Single master brand: Recoder.
- Product line names: Recoder, Recoder Agency, Recoder PM.

3. Monorepo and infra:
- Keep under `recoder.xyz` org with shared auth, billing, analytics, and deployment standards.

## Suna Usage Policy (License-Safe)

- Do not fork or commercialize Suna directly.
- Allowed workflow: clone/read Suna for reference, then re-implement required behavior in `recoder-agency`.
- Keep Recoder Agency code, architecture, and UX implementation original and repo-native.
- Track sourced inspiration at feature level (what was referenced, what was independently implemented).

## Agent and Subagent Operating Model

## 1) Program Orchestrator Agent (owner)

Responsibilities:
- Own roadmap, prioritization, dependencies, and weekly execution review.
- Enforce KPI movement and shipping cadence.

Subagents:
- Roadmap Subagent: maintains milestone board and phase gates.
- Risk Subagent: tracks blockers, legal/compliance, integration risk.
- Metrics Subagent: reports KPI deltas weekly.

## 2) Product Strategy Agent

Responsibilities:
- Define ideal customer profile, service packages, and workflow templates.

Subagents:
- ICP Subagent: narrows first vertical (start with one niche).
- Offer Design Subagent: defines packaged outcomes and pricing tiers.
- Acceptance Criteria Subagent: defines “finished work” quality bars.

## 3) Platform Engineering Agent

Responsibilities:
- Build a Suna-inspired platform inside Recoder Agency, integrate Recoder stack patterns, harden for production.

Subagents:
- Architecture Subagent: boundary decisions, service topology, data model.
- Backend Subagent (`ts-coder`): workflow engine, jobs, API contracts.
- Frontend Subagent (`react-coder`): ops dashboard, client portal, review UX.
- UX Subagent (`ux-guardian`): usability and workflow friction audits.
- Brand Subagent (`brand-guardian`): consistency across UI/assets.

## 4) Delivery Ops Agent

Responsibilities:
- Convert services into repeatable AI pipelines.

Subagents:
- Template Library Subagent: project starter templates and SOPs.
- QA Subagent (`proofreader` + test automation): output quality checks.
- Handoff Subagent: client-ready packaging and approval workflows.

## 5) Revenue Agent

Responsibilities:
- Own go-to-market feedback loop and commercialization.

Subagents:
- Pricing Subagent: margin-safe pricing model.
- Pipeline Subagent: outbound/inbound experiments.
- Case Study Subagent: proof artifacts from delivered projects.

## 90-Day Phased Plan

## Phase 0 (Week 1-2): Foundation

- Create `recoder-agency` baseline using Suna as a reference model only.
- Define canonical service vertical (one niche only).
- Lock domain (`agency.recoder.xyz`) and environment topology.
- Set KPI dashboards and instrumentation.

Exit criteria:
- Working Recoder Agency baseline deployed in staging.
- KPI events emitting.
- First service package spec approved.

## Phase 1 (Week 3-6): Core Productization

- Build core pipeline: intake -> planning -> execution -> QA -> delivery.
- Add client portal for brief upload, status, and approvals.
- Add internal operator console for exceptions and overrides.
- Implement reusable workflow templates.

Exit criteria:
- End-to-end delivery works for one service type.
- First internal dogfood projects completed.

## Phase 2 (Week 7-10): Margin Engine

- Optimize automation rate with tighter prompts/tools/validators.
- Add quality gates and automatic rejection/fix loops.
- Add cost controls per task/model/provider.
- Standardize “human in the loop only when confidence < threshold”.

Exit criteria:
- Measurable cycle-time reduction.
- Margin baseline at target band for pilot projects.

## Phase 3 (Week 11-13): Pilot Revenue

- Run 3-5 paid pilot clients through platform.
- Track acceptance, revision rate, and unit economics.
- Publish case studies and refine packaging.

Exit criteria:
- Repeatable pilot motion with validated pricing.
- Clear path to scale in one niche.

## Immediate Build Backlog (Next 2 Weeks)

1. Finalize architecture doc: Suna reference delta + Recoder conventions.
   See `docs/plan/suna-reference-delta.md`.
2. Implement `brief intake` schema and workflow kickoff endpoint.
3. Build project state machine (`queued`, `in_progress`, `qa`, `client_review`, `done`).
4. Add QA gate runner (lint/checklist/content validation).
5. Build minimal client review page with approve/request-changes.
6. Add KPI event tracking + dashboard seed queries.

## Governance and Cadence

- Daily: agent standup (blockers, decisions, KPI anomalies).
- Weekly: milestone review and KPI scorecard.
- Bi-weekly: package/pricing revision based on real delivery data.

## Definition of Done (Platform Level)

A feature is done only if:
- It improves at least one core KPI.
- It includes observability and rollback path.
- It is integrated into a full delivery workflow, not isolated tooling.

## Changelog

- 2026-02-07: Created initial AI-native agency execution plan.
- 2026-02-07: Updated to Suna-inspired, license-safe implementation model (no fork/commercialization).
- 2026-02-07: Added execution-grade production backlog in `docs/plan/production-grade-backlog.md`.

## Current Build Status (2026-02-07)

Execution source of truth is now:
- `docs/plan/production-grade-backlog.md`

### Delivery Snapshot

| Track | Status | Notes |
|---|---|---|
| Workflow stability + transition integrity | Done | Constraints, duplicate/no-op guardrails, forced-reason checks |
| Client review hardening | Done | Optimistic rollback, bulk approve/reject, strict reject reason |
| Delivery Ops baseline | Done | Stuck/forced/rework, filters/pagination, compare windows |
| KPI metrics + freshness | Done | Weekly materialized view, dashboard cards, freshness checks |
| QA/DoD enforcement | Done | Gate checks + forced override + transition visibility shipped |
| Commercial system (catalog/quote/SOW) | Done | Service catalog + quote/SOW + project creation flow |
| Change orders + billing automation | Done | Client CO approvals + milestone billing + invoice retries |
| Margin controls + unit economics | Done | Cost guardrails + project P&L dashboard panel |
| RBAC hardening | Done | Admin write actions gated server-side + role constraints migration |
| Audit coverage completion | In progress | DB trigger blocks direct status updates; guardrail script expanded |
| Backup/restore release gate | In progress | Restore drill evidence table + release-readiness enforcement added |

Recently shipped foundations:
- Delivery workflow constraints and transition integrity checks.
- Transition history filtering/pagination and retry panel with suggestions.
- Forced transition support with required reason.
- Client review hardening:
  - optimistic UI rollback + errors
  - bulk approve/reject
  - strict reject reason enforcement.
- Delivery Ops baseline:
  - stuck projects
  - forced transitions
  - rework spikes
  - compare windows and risk filtering.
- Weekly metrics materialized view + dashboard KPI cards + freshness signal.
- Commercial workflow:
  - service SKU catalog with scope override reason
  - quote to SOW to project flow
  - change-order creation and client approve/reject loop.
- Billing automation:
  - milestone billable toggles
  - invoice retry queue and retry actions.
- Margin controls:
  - per-project warning/hard-stop cost thresholds
  - transition metadata guardrail snapshots
  - dashboard cost breach events and project unit economics panel.
- RBAC hardening:
  - centralized role gate helpers (`requireAdminRole`, `requireCurrentTeamRole`)
  - admin server-action mutation paths require `admin`
  - role value constraints on memberships/invitations (`0094_agency_roles.sql`).
- Staging ops/CI:
  - delivery transition checks
  - weekly metrics refresh/fixture/freshness checks
  - transition guardrail checks.
- QA/DoD rollout:
  - Definition-of-Done template schema
  - QA gate run logs
  - send-for-review QA gate enforcement
  - force-send override with required reason
  - transition and project-level QA visibility
  - DoD admin template management UI.

Next in sequence:
1. Audit coverage completion (`AGENCY-P0-011`).
2. Backup/restore + retention release gate (`AGENCY-P0-012`).
3. P1 cost-routing + playbooks (`AGENCY-P1-001`, `AGENCY-P1-002`).

### 2-Week Milestone Plan

| Window | Target | Exit Signal |
|---|---|---|
| Week 1 | `AGENCY-P0-001`, `AGENCY-P0-002` | Service catalog + quote-to-project flow usable in staging |
| Week 2 | `AGENCY-P0-004`, `AGENCY-P0-003` | Change orders and milestone billing runnable end-to-end |
