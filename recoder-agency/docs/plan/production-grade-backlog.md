# Recoder Agency Production-Grade Backlog

Last updated: 2026-02-10

Goal: ship a production-grade AI-native agency app that delivers finished work with software-like margins.

## KPI Targets (Release Gate)

- On-time milestone delivery: `>= 95%`
- First-pass approval rate: `>= 70%` (phase 1), `>= 80%` (phase 2)
- Forced transition rate: `<= 5%`
- Rework rate (`client_review -> in_progress`): `<= 15%`
- Gross margin per project: `>= 60%` target band

## Status Summary

Done (shipped):
- Delivery workflow/state machine hardening, transition audit guardrails, forced transition reason.
- Delivery Ops page + stuck/forced/rework views + exception queue.
- Transition history filters/pagination and retry suggestions.
- Client review hardening (optimistic rollback, bulk actions, reject reason requirement).
- Weekly metrics materialized view + dashboard KPI cards + freshness indicator.
- RBAC hardening for admin mutation paths.
- Required deploy gate smokes + seeded transition smoke.
- Post-gate health probe (`/api/health`) in deploy pipeline.
- Cron endpoint rate limiting for `/api/agency/cron/*` with tests.
- Trivy container scan + CycloneDX SBOM workflow.
- Staging→production promotion workflow with manual approval gate.
- Runbooks: delivery staging/rollout/rollback + incident/troubleshooting/monitoring/DR + promotion.

Operational blockers (not code, must complete):
- Create GitHub environment `production-promotion` with required reviewers.
- Add repo secret `PRODUCTION_DEPLOY_WEBHOOK_URL`.
- Rotate and normalize production secrets (remove placeholder/test values).
- Run release-readiness evidence sequence on staging in one clean pass.

## P0 Remaining (Production Readiness Completion)

### OPS-P0-001 Promotion Gate Activation
- Status: `Pending (ops)`
- Outcome: promotion workflow usable for real releases.
- Acceptance:
- `production-promotion` environment exists with required reviewers.
- `PRODUCTION_DEPLOY_WEBHOOK_URL` is configured.
- Dry-run and one real promotion complete with audit trail.

### OPS-P0-002 Secrets Hygiene and Canonical Env Enforcement
- Status: `Pending (ops)`
- Outcome: no conflicting/placeholder auth or infra secrets.
- Acceptance:
- Canonical env names only in deploy environments.
- Placeholder/test credentials removed.
- Secret rotation documented with timestamp and owner.

### OPS-P0-003 Staging Readiness Evidence Gate
- Status: `Pending (ops)`
- Outcome: release decision is backed by fresh DB/restore evidence.
- Acceptance:
- Sequence passes in one run:
  - `ops:staging:cleanup-weekly-metrics-fixture`
  - `ops:staging:seed-weekly-metrics-fixture`
  - `ops:staging:log-restore-drill`
  - `ops:staging:assert-release-readiness`

### OPS-P0-004 Alert Routing Activation
- Status: `Pending`
- Outcome: failures page the right owners.
- Acceptance:
- Alert routes configured for failed deploy gate, cron failures, smoke failures.
- Escalation thresholds match `docs/runbooks/monitoring-and-alerts.md`.

## P1 Next (Scale + Margin Optimization)

### AGENCY-P1-001 Delivery Playbooks Library
- Status: `Next`
- Acceptance: project bootstrap from playbook with pre-wired DoD/QA/SLA.

### AGENCY-P1-002 Model/Provider Cost Routing
- Status: `Next`
- Acceptance: policy-based lower-cost fallback while maintaining quality thresholds.

### AGENCY-P1-003 Capacity + WIP Visibility
- Status: `Next`
- Acceptance: overloaded teams and WIP violations surfaced with clear ownership.

## CI/QA Reliability Track

### QA-001 Required Smoke Stability
- Status: `In progress`
- Acceptance:
- Required deploy smokes remain green over rolling 7 days.
- Nightly smoke matrix remains green with seeded scenario.

### QA-002 DB Pipeline Stability
- Status: `In progress`
- Acceptance:
- Weekly fixture pipeline and transition guardrails workflows are green on schedule.

## Recommended Execution Order (Current)

1. `OPS-P0-001` Promotion Gate Activation
2. `OPS-P0-002` Secrets Hygiene
3. `OPS-P0-003` Staging Readiness Evidence Gate
4. `OPS-P0-004` Alert Routing Activation
5. `AGENCY-P1-001` + `AGENCY-P1-002` + `AGENCY-P1-003`

## Done Criteria Per Ticket

- Behavior implemented and verified in staging.
- Required CI/workflows green.
- Runbooks updated for operational changes.
- Evidence captured (logs/workflow links/check outputs) for release decisions.

Primary release gate document:
- `docs/plan/release-readiness-scorecard.md`
