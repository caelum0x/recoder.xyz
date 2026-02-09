# Recoder Agency Production-Grade Backlog

Last updated: 2026-02-07

Goal: ship a production-grade AI-native agency app that delivers finished work with software-like margins.

## KPI Targets (Release Gate)

- On-time milestone delivery: `>= 95%`
- First-pass approval rate: `>= 70%` (phase 1), `>= 80%` (phase 2)
- Forced transition rate: `<= 5%`
- Rework rate (`client_review -> in_progress`): `<= 15%`
- Gross margin per project: `>= 60%` target band

## P0 Tickets (Must Ship)

### AGENCY-P0-001 Service Catalog + Fixed-Scope SKUs
- Outcome: productized offers with enforceable scope and SLA defaults.
- File targets:
`apps/agency/db/schema.ts`
`apps/agency/db/migrate/0084_service_catalog.sql`
`apps/agency/app/(admin)/templates/page.tsx`
`apps/agency/app/(admin)/projects/actions.ts`
- Acceptance:
- Admin can create/edit SKU with `scope`, `price`, `sla_days`, `revision_limit`.
- New projects must attach a SKU (or explicit override reason).

### AGENCY-P0-002 Quote -> SOW -> Project Creation Flow
- Outcome: commercial intake is structured and auditable.
- File targets:
`apps/agency/db/migrate/0085_quotes_and_sows.sql`
`apps/agency/app/(admin)/clients/[clientId]/page.tsx`
`apps/agency/app/(admin)/projects/actions.ts`
`apps/agency/lib/agency/project-transition.ts`
- Acceptance:
- Quote can be moved to accepted/rejected.
- Accepted quote generates project with linked commercial record.

### AGENCY-P0-003 Milestone Billing + Auto Invoice Retry
- Outcome: revenue capture is automated.
- File targets:
`apps/agency/db/migrate/0086_milestones_and_billing.sql`
`apps/agency/app/(admin)/projects/[projectId]/page.tsx`
`apps/agency/app/(admin)/dashboard/page.tsx`
`apps/agency/app/webhooks/stripe/handle-pricing-plan-subscription.ts`
- Acceptance:
- Milestones can be marked billable.
- Invoice failures are retried and shown in admin dashboard.

### AGENCY-P0-004 Change Order Workflow
- Outcome: scope creep is controlled with client approval trail.
- File targets:
`apps/agency/db/migrate/0087_change_orders.sql`
`apps/agency/app/(admin)/projects/[projectId]/page.tsx`
`apps/agency/app/(client)/portal/projects/[projectId]/page.tsx`
`apps/agency/app/(client)/portal/projects/[projectId]/actions.ts`
- Acceptance:
- Client can approve/reject change order.
- Project scope and billing deltas are versioned.

### AGENCY-P0-005 SLA Engine + Breach Escalations
- Outcome: delivery deadlines become enforceable.
- File targets:
`apps/agency/db/migrate/0088_sla_policies.sql`
`apps/agency/lib/agency/delivery-ops.ts`
`apps/agency/app/(admin)/delivery-ops/page.tsx`
`apps/agency/.github/workflows/staging-db-delivery-transition-check.yml`
- Acceptance:
- Stuck/breach projects surfaced by SLA state.
- Escalation reason and owner visible in Delivery Ops.

### AGENCY-P0-006 Definition-of-Done Templates
- Outcome: each deliverable type has deterministic completion criteria.
- File targets:
`apps/agency/db/migrate/0089_definition_of_done.sql`
`apps/agency/app/(admin)/templates/page.tsx`
`apps/agency/app/(admin)/projects/[projectId]/deliverable-section.tsx`
- Acceptance:
- Deliverables cannot move to `pending_review` unless DoD checks pass or override is forced with reason.

### AGENCY-P0-007 QA Gate Runner Before Client Review
- Outcome: quality checks run before client sees output.
- File targets:
`apps/agency/app/(admin)/projects/[projectId]/deliverables-actions.ts`
`apps/agency/lib/agency/project-workflow.ts`
`apps/agency/app/(admin)/projects/[projectId]/project-transition-history.tsx`
- Acceptance:
- Transition to review blocked on failed QA gate.
- Transition history records QA result metadata.

### AGENCY-P0-008 Cost Guardrails per Project
- Outcome: prevents runaway model/tool spend.
- File targets:
`apps/agency/db/migrate/0090_project_budgets.sql`
`apps/agency/app/(admin)/projects/[projectId]/page.tsx`
`apps/agency/app/(admin)/dashboard/page.tsx`
`apps/agency/lib/agency/weekly-delivery-metrics.ts`
- Acceptance:
- Budget threshold warnings and hard-stop threshold are configurable.
- Breach events appear on dashboard and in transitions metadata.

### AGENCY-P0-009 Margin Dashboard (Project P&L)
- Outcome: real-time unit economics.
- File targets:
`apps/agency/db/migrate/0091_project_unit_economics_view.sql`
`apps/agency/app/(admin)/dashboard/page.tsx`
`apps/agency/lib/agency/weekly-delivery-metrics.ts`
- Acceptance:
- Dashboard shows revenue, AI/tool cost, human effort proxy, gross margin.
- Non-empty and empty states both covered by smoke tests.

### AGENCY-P0-010 RBAC Hardening (Admin/Ops/PM/Client)
- Outcome: correct permission boundaries.
- File targets:
`apps/agency/db/migrate/0092_agency_roles.sql`
`apps/agency/app/(admin)/layout.tsx`
`apps/agency/app/(client)/portal/layout.tsx`
`apps/agency/services/teams/index.ts`
- Acceptance:
- Unauthorized access rejected server-side for all admin actions.
- Role matrix documented and tested for critical routes.

### AGENCY-P0-011 Audit Coverage Completion
- Outcome: all critical write actions are audit-visible.
- File targets:
`apps/agency/lib/agency/project-transition.ts`
`apps/agency/app/(admin)/projects/actions.ts`
`apps/agency/app/(client)/portal/projects/[projectId]/actions.ts`
`apps/agency/db/scripts/test_transition_guardrails.sql`
- Acceptance:
- No direct project-status update without audit row.
- Duplicate/no-op insert protections pass in DB script and CI workflow.

### AGENCY-P0-012 Backup/Restore + Retention Runbook Enforcement
- Outcome: operational safety baseline.
- File targets:
`docs/runbooks/agency-delivery-staging.md`
`docs/runbooks/agency-delivery-rollout-checklist.md`
`docs/runbooks/agency-delivery-rollback-snippets.sql`
`.github/workflows/staging-db-transition-guardrails-check.yml`
- Acceptance:
- Runbook includes restore drill and retention procedure.
- Checklist gate requires last successful restore proof.

## P1 Tickets (Scale + Margin Optimization)

### AGENCY-P1-001 Delivery Playbooks Library
- File targets:
`apps/agency/app/(admin)/templates/page.tsx`
`apps/agency/db/migrate/0093_delivery_playbooks.sql`
`apps/agency/app/(admin)/projects/actions.ts`
- Acceptance: project bootstrap from playbook with pre-wired DoD/QA/SLA.

### AGENCY-P1-002 Model/Provider Cost Routing
- File targets:
`apps/agency/app/giselle.ts`
`apps/agency/app/(admin)/dashboard/page.tsx`
`apps/agency/db/migrate/0094_model_routing_policies.sql`
- Acceptance: policy-based cheaper fallback when quality threshold is met.

### AGENCY-P1-003 Client Milestone-Level Approve/Reject
- File targets:
`apps/agency/app/(client)/portal/projects/[projectId]/page.tsx`
`apps/agency/app/(client)/portal/projects/[projectId]/actions.ts`
`apps/agency/db/migrate/0095_milestone_reviews.sql`
- Acceptance: approvals at milestone level, not only per deliverable.

### AGENCY-P1-004 Weekly Client Auto-Update Digest
- File targets:
`apps/agency/emails/`
`apps/agency/app/(admin)/projects/[projectId]/page.tsx`
`apps/agency/db/migrate/0096_client_update_digests.sql`
- Acceptance: scheduled digest with status, risks, decisions, next steps.

### AGENCY-P1-005 Capacity + WIP Limit Board
- File targets:
`apps/agency/app/(admin)/delivery-ops/page.tsx`
`apps/agency/lib/agency/delivery-ops.ts`
`apps/agency/db/migrate/0097_capacity_planning.sql`
- Acceptance: overloaded teams highlighted; WIP violations visible.

### AGENCY-P1-006 Alerting Integrations (Slack/Email)
- File targets:
`apps/agency/app/api/`
`apps/agency/lib/agency/delivery-ops.ts`
`apps/agency/db/migrate/0098_alert_subscriptions.sql`
- Acceptance: SLA breach / stuck / high rework alerts routed to owners.

## P2 Tickets (Enterprise + Expansion)

### AGENCY-P2-001 Multi-Team Isolation Hardening
- File targets:
`apps/agency/db/schema.ts`
`apps/agency/services/teams/`
`apps/agency/app/(admin)/`
- Acceptance: strict tenant boundaries and no cross-team leakage.

### AGENCY-P2-002 Compliance Evidence Pack (SOC2-ready)
- File targets:
`docs/adr/`
`docs/runbooks/`
`.github/workflows/`
- Acceptance: evidence generation paths for access, changes, incidents, backups.

### AGENCY-P2-003 White-label Client Portal Controls
- File targets:
`apps/agency/app/(client)/portal/`
`apps/agency/db/migrate/0099_branding_profiles.sql`
- Acceptance: per-client branding without weakening security boundaries.

## Testing and CI Tickets (Cross-Cut)

### AGENCY-QA-001 Playwright Production Gate Suite
- File targets:
`apps/agency/tests/e2e/logged-in/admin-dashboard-kpi-cards.spec.ts`
`apps/agency/tests/e2e/logged-in/admin-delivery-ops-risk-filters.spec.ts`
`apps/agency/tests/e2e/logged-in/client-portal-seeded-transition.spec.ts`
`.github/workflows/agency-smoke-nightly.yml`
- Acceptance: nightly matrix green for all agency smokes.

### AGENCY-QA-002 DB Pipeline Integration Workflow
- File targets:
`.github/workflows/staging-db-weekly-metrics-fixture-check.yml`
`.github/workflows/staging-db-transition-guardrails-check.yml`
`apps/agency/db/scripts/test_transition_guardrails.sql`
- Acceptance: seeded KPI pipeline and transition guardrails both verified on schedule.

## Recommended Execution Order (Next 3 Sprints)

1. Sprint A: `P0-005` `P0-006` `P0-007` `P0-011` `P0-012`
2. Sprint B: `P0-001` `P0-002` `P0-004` `P0-010`
3. Sprint C: `P0-003` `P0-008` `P0-009` + `QA-001` `QA-002`

## Done Criteria Per Ticket

- Schema/migration landed and repeatable on staging.
- Admin/client UX surfaced where relevant.
- Audit and observability included.
- Automated test coverage added (DB script and/or Playwright).
- Runbook/ops command updated if production behavior changed.
