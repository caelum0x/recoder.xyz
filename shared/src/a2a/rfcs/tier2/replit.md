# RFC: Tier-2 Connector - Replit

## Connector Identity
- Connector ID: `replit`
- Vendor / Product: Replit
- Proposed tier: Tier-2
- Owner: Interop Platform
- Status: draft

## Scope and Goals
- Problem statement: allow delegated code/runtime tasks into Replit-oriented flows while preserving policy and traceability.
- In-scope workflows: delegated execution, status polling, artifact return.
- Out-of-scope workflows: account provisioning, payment-plan synchronization.

## Protocol and Contract Mapping
- A2A envelope intents used: `execute`, `status`, `handoff`, `error`.
- Task envelope states used: `submitted`, `working`, `blocked`, `succeeded`, `failed`.
- Error taxonomy mapping notes: sandbox errors map to `EXECUTION_FAILED`.

## Policy Mapping
- Required approval policy for privileged actions: approvals required for network egress and deployment actions.
- Scope boundaries / tenant isolation: workspace-scoped task delegation; task trace must include `trace_id`.
- Audit events emitted: `task.delegated`, `policy.decision`, `task.state_changed`, `task.completed`.
- Default rate limits: 15 delegated jobs/min per workspace.

## Security and Compliance
- Auth model: scoped bridge token with rotation policy.
- Secret storage model: server-side vault references only.
- Data residency/compliance considerations: do not persist full source snapshots in connector metadata.

## Reliability and SLO Expectations
- Success-rate target: >= 96%.
- Median latency target: <= 4500ms first acknowledgement.
- Failure classes and fallback behavior: timeout -> retry; policy block -> terminal `blocked`.

## Engineering Estimate
- Discovery: 2d.
- Adapter implementation: 5d.
- Contract tests: 2d.
- UI/analytics integration: 2d.
- Total estimate: 11d.

## Promotion Checklist
- [ ] Contract tests pass in CI (`connector-contract-tests`)
- [ ] Weekly evidence pack contains connector metrics
- [ ] No open P0 auth/policy/audit defects
- [ ] Runbook + rollback notes completed
- [ ] Product analytics events are emitted with `connector_id`

## Evidence Links
- Latest phase3 gates artifact: `logs/phase3-gates/*-connectors-support.json`
- Latest release evidence artifact: `logs/release-evidence/*-connectors-support.json`
- Related PRs/issues: SFA-021 / SFA-022

